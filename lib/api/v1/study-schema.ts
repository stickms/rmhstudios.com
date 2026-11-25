/**
 * Zod schemas and cursor encoding for `/api/v1/me/decks*`. Pure (no server imports) so the limits are
 * testable on their own. Card fields use the editor's limits and its `validateCard` rules.
 */
import { z } from 'zod';
import { CARD_KINDS, validateCard } from '@/lib/study/card-types';
import { sinceParam } from '@/lib/api/v1/sync-schema';
import { CARD_SIDE_MAX, CLOZE_TEXT_MAX } from '@/lib/study/limits';
import { CARD_IMAGE_ALT_MAX } from '@/lib/study/card-images';
import { occlusionInput } from '@/lib/study/occlusion-schema';
import type { Grade } from '@/lib/rmhstudy/srs';

/** Cards one `POST …/cards` request may add. */
export const API_BATCH_MAX = 100;
/** Page size ceiling for the list endpoints. */
export const API_PAGE_MAX = 100;
export const API_PAGE_DEFAULT = 20;
export const EXTERNAL_ID_MAX = 100;
const ID_MAX = 64;

export const idParam = z.string().min(1).max(ID_MAX);
export const externalIdParam = z.string().min(1).max(EXTERNAL_ID_MAX);

export const deckPath = z.object({
  id: idParam,
});
export const cardPath = z.object({
  id: idParam,
  cardId: idParam,
});
export const externalCardPath = z.object({
  id: idParam,
  externalId: externalIdParam,
});

/** `?limit=&cursor=`; a repeated parameter is not supported. */
export const pageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(API_PAGE_MAX).default(API_PAGE_DEFAULT),
  cursor: z.string().min(1).max(200).optional(),
});

/** `?limit=&cursor=&since=` on a deck's cards: `since` is an ISO 8601 instant; cards created after it. */
export const cardsQuery = pageQuery.extend({ since: sinceParam });

/**
 * A picture to set on a card side: `media_id` is one the key owner uploaded through `POST /api/v1/images` (with
 * `surface=flashcard`), `alt` is the description a screen reader reads and is required. `null` removes a picture.
 */
export const pictureInput = z
  .object({
    media_id: z.string().min(1).max(64),
    alt: z.string().max(CARD_IMAGE_ALT_MAX * 2),
  })
  .strict();

const pictureFields = {
  frontImage: pictureInput.nullable().optional(),
  backImage: pictureInput.nullable().optional(),
};

/**
 * The masks of an occlusion card (`kind: 'occlusion'`, s09-03): `{ mode: 'hide-all' | 'hide-one', masks: [{ id?, x, y,
 * w, h, label }] }` in picture-relative units. Send back the `id`s a read returned so a card keeps its review history;
 * a mask with no `id` takes the next free one. `null` clears them (a card changed to another kind).
 */
const occlusionField = { occlusion: occlusionInput.nullable().optional() };

const cardFields = {
  kind: z.enum(CARD_KINDS).optional(),
  // Required for every kind but occlusion, where it is the optional prompt (`validateCard` says which).
  front: z.string().trim().max(CLOZE_TEXT_MAX).default(''),
  back: z.string().trim().max(CARD_SIDE_MAX).optional(),
  ...pictureFields,
  ...occlusionField,
};

/** A picture needs its description, and a cloze card's front takes none. */
function pictureIssues(
  card: {
    kind?: (typeof CARD_KINDS)[number] | undefined;
    frontImage?:
      | {
          alt: string;
        }
      | null
      | undefined;
    backImage?:
      | {
          alt: string;
        }
      | null
      | undefined;
  },
  ctx: z.RefinementCtx,
) {
  if (card.frontImage && card.kind === 'cloze')
    ctx.addIssue({
      code: 'custom',
      message: 'A cloze card takes a picture on the back only.',
    });
  for (const side of ['frontImage', 'backImage'] as const) {
    const image = card[side];
    if (image && image.alt.trim().length === 0)
      ctx.addIssue({
        code: 'custom',
        message: `${side} needs an alt description.`,
      });
    if (image && image.alt.trim().length > CARD_IMAGE_ALT_MAX)
      ctx.addIssue({
        code: 'custom',
        message: `${side} alt is over ${CARD_IMAGE_ALT_MAX} characters.`,
      });
  }
}

function checked(
  card: {
    kind?: (typeof CARD_KINDS)[number] | undefined;
    front: string;
    back?: string | undefined;
    frontImage?:
      | {
          alt: string;
        }
      | null
      | undefined;
    backImage?:
      | {
          alt: string;
        }
      | null
      | undefined;
    occlusion?: unknown;
  },
  ctx: z.RefinementCtx,
) {
  pictureIssues(card, ctx);
  if (card.kind === 'occlusion') {
    if (!card.frontImage)
      ctx.addIssue({
        code: 'custom',
        message: 'An occlusion card needs a front picture.',
      });
    if (card.backImage)
      ctx.addIssue({
        code: 'custom',
        message: 'An occlusion card takes a picture on the front only.',
      });
  }
  const result = validateCard(card);
  if (!result.ok)
    ctx.addIssue({
      code: 'custom',
      message: result.error,
    });
}

/** A card to create. */
export const newCard = z
  .object({
    ...cardFields,
    externalId: externalIdParam.optional(),
  })
  .strict()
  .superRefine(checked);

/** The body of an upsert by external id (the id is in the path). */
export const upsertCardBody = z.object(cardFields).strict().superRefine(checked);

/** `POST …/cards`: 1 to 100 cards, all or nothing. */
export const batchBody = z
  .object({
    cards: z.array(newCard).min(1).max(API_BATCH_MAX),
  })
  .strict();

export const patchCardBody = z
  .object({
    kind: z.enum(CARD_KINDS).optional(),
    front: z.string().trim().max(CLOZE_TEXT_MAX).optional(),
    back: z.string().trim().max(CARD_SIDE_MAX).optional(),
    ...pictureFields,
    ...occlusionField,
  })
  .strict()
  .superRefine((b, ctx) => {
    if (
      b.front === undefined &&
      b.back === undefined &&
      b.kind === undefined &&
      b.frontImage === undefined &&
      b.backImage === undefined &&
      b.occlusion === undefined
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Provide kind, front, back, a picture or occlusion.',
      });
    pictureIssues(b, ctx);
  });

export const createDeckBody = z
  .object({
    title: z.string().trim().min(1).max(100),
    description: z.string().trim().max(500).optional(),
    isPublic: z.boolean().optional(),
  })
  .strict();

export const patchDeckBody = z
  .object({
    title: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(500).optional(),
    isPublic: z.boolean().optional(),
  })
  .strict()
  .refine((b) => b.title !== undefined || b.description !== undefined || b.isPublic !== undefined, {
    message: 'Provide title, description or isPublic.',
  });

/* --------------------------------- reviews --------------------------------- */

/** Cards one `GET …/review` may return (the site's queue is longer; a tool asks for what its screen holds). */
export const REVIEW_LIMIT_MAX = 50;
export const REVIEW_LIMIT_DEFAULT = 20;

/** `?limit=` on a deck's review queue; a repeated parameter is not supported. */
export const reviewQuery = z.object({
  limit: z.coerce.number().int().min(1).max(REVIEW_LIMIT_MAX).default(REVIEW_LIMIT_DEFAULT),
});

/** The grades by name, in the site's order (`Grade` 0 to 3 in `lib/rmhstudy/srs.ts`). */
export const GRADE_NAMES = ['again', 'hard', 'good', 'easy'] as const;
export type GradeName = (typeof GRADE_NAMES)[number];

/** `{ grade: 'again' | 'hard' | 'good' | 'easy' }`. */
export const gradeBody = z
  .object({
    grade: z.enum(GRADE_NAMES),
  })
  .strict();

/** The scheduler's number for a grade name. */
export function gradeOf(name: GradeName): Grade {
  return GRADE_NAMES.indexOf(name) as Grade;
}

/* -------------------------------- cursors --------------------------------- */

const b64 = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s: string) => {
  try {
    return atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  } catch {
    return null;
  }
};

/** Decks page by (`updatedAt`, `id`), newest first. */
export function encodeDeckCursor(updatedAt: Date, id: string): string {
  return b64(`${updatedAt.toISOString()}|${id}`);
}

export function decodeDeckCursor(cursor: string): {
  updatedAt: Date;
  id: string;
} | null {
  const raw = unb64(cursor);
  const at = raw?.indexOf('|') ?? -1;
  if (raw === null || at < 1) return null;
  const updatedAt = new Date(raw.slice(0, at));
  const id = raw.slice(at + 1);
  if (Number.isNaN(updatedAt.getTime()) || id === '' || id.length > ID_MAX) return null;
  return {
    updatedAt,
    id,
  };
}

/** Cards page by (`position`, `id`), in deck order. */
export function encodeCardCursor(position: number, id: string): string {
  return b64(`${position}|${id}`);
}

export function decodeCardCursor(cursor: string): {
  position: number;
  id: string;
} | null {
  const raw = unb64(cursor);
  const at = raw?.indexOf('|') ?? -1;
  if (raw === null || at < 1) return null;
  const head = raw.slice(0, at);
  const id = raw.slice(at + 1);
  if (!/^\d{1,9}$/.test(head) || id === '' || id.length > ID_MAX) return null;
  return {
    position: Number(head),
    id,
  };
}
