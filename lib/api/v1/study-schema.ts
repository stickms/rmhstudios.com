/**
 * Zod schemas and cursor encoding for `/api/v1/me/decks*`. Pure (no server imports) so the limits are
 * testable on their own. Card fields use the editor's limits and its `validateCard` rules.
 */
import { z } from 'zod';
import { CARD_KINDS, validateCard } from '@/lib/study/card-types';
import { CARD_SIDE_MAX, CLOZE_TEXT_MAX } from '@/lib/study/limits';

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

const cardFields = {
  kind: z.enum(CARD_KINDS).optional(),
  front: z.string().trim().min(1).max(CLOZE_TEXT_MAX),
  back: z.string().trim().max(CARD_SIDE_MAX).optional(),
};

function checked(
  card: {
    kind?: (typeof CARD_KINDS)[number] | undefined;
    front: string;
    back?: string | undefined;
  },
  ctx: z.RefinementCtx,
) {
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
    front: z.string().trim().min(1).max(CLOZE_TEXT_MAX).optional(),
    back: z.string().trim().max(CARD_SIDE_MAX).optional(),
  })
  .strict()
  .refine((b) => b.front !== undefined || b.back !== undefined || b.kind !== undefined, {
    message: 'Provide kind, front or back.',
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
