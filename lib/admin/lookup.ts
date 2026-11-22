/**
 * The pure half of the admin lookup (`/admin/lookup`): what a pasted string is, which entity kinds
 * are worth asking about it, and the state labels a result carries. Client-safe: no Prisma, no zod.
 *
 * A lookup only ever asks a fixed list of unique-key questions (a primary key, a unique handle, a
 * unique e-mail, a unique slug). It never scans, and it never names a private-message model: direct
 * and group messages are not in `LOOKUP_KINDS`, so no input can reach them.
 */
import { HANDLE_REGEX } from '@/lib/handle';
import { SITE_URL } from '@/lib/seo';
import type { ReportEntityType } from '@/lib/moderation/report-constants';
import type { TriageStatus } from '@/lib/moderation/triage-constants';

export const LOOKUP_KINDS = [
  'user',
  'post',
  'comment',
  'community',
  'event',
  'tournament',
  'build',
  'replay',
  'report',
  'note',
  'outbox',
  'jam',
  'library',
  'news',
  'blog',
] as const;
export type LookupKind = (typeof LOOKUP_KINDS)[number];

/** The state labels a result can carry. Translated through one literal map in the UI. */
export const LOOKUP_STATES = [
  'deleted',
  'banned',
  'hidden',
  'private',
  'unlisted',
  'cancelled',
  'draft',
  'bot',
  'admin',
  'reported',
  'pending',
  'resolved',
  'withdrawn',
  'dead',
  'delivered',
  'expired',
] as const;
export type LookupState = (typeof LOOKUP_STATES)[number];

/** Which input was recognised. `junk` is anything that is none of the others. */
export type LookupInputKind = 'email' | 'handle' | 'id' | 'site-link' | 'foreign-link' | 'unknown-path' | 'junk';

export type IdShape = 'cuid' | 'uuid' | 'bigint';

export const MAX_LOOKUP_LENGTH = 500;

/** The most items one batch lookup takes. */
export const MAX_BATCH_ITEMS = 50;

/**
 * Split pasted text into lookup items: newlines, commas and spaces separate them, blanks drop and a
 * repeated item keeps its first place. Pure, so the page can show "{{n}} items" before it submits.
 */
export function splitLookupInput(raw: string): string[] {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const part of raw.split(/[\s,]+/)) {
    const item = part.trim();
    if (item.length === 0 || seen.has(item)) continue;
    seen.add(item);
    items.push(item);
  }
  return items;
}

/** Trim, drop blanks and collapse repeats (the server's own pass over a batch body). */
export function normaliseBatchItems(items: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const item = raw.trim();
    if (item.length === 0 || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

const CUID = /^c[a-z0-9]{20,31}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** At most 18 digits, so the value always fits a 64-bit signed integer. */
const BIGINT = /^[1-9]\d{0,17}$/;
const EMAIL = /^[A-Za-z0-9._%+'-]{1,64}@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,24}$/;
/** A path segment that can be an id or a slug (or an `@handle`). */
const SEGMENT = /^@?[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/;

export function idShapeOf(raw: string): IdShape | null {
  if (CUID.test(raw)) return 'cuid';
  if (UUID.test(raw)) return 'uuid';
  if (BIGINT.test(raw)) return 'bigint';
  return null;
}

/** A page of the site that names one thing, and the key it is named by. */
export type SiteTarget =
  | {
      kind: 'user';
      key: string;
    }
  | {
      kind: 'post';
      key: string;
    }
  | {
      kind: 'community';
      key: string;
    }
  | {
      kind: 'tournament';
      key: string;
    }
  | {
      kind: 'jam';
      key: string;
    }
  | {
      kind: 'build';
      key: string;
    }
  | {
      kind: 'replay';
      key: string;
    }
  | {
      kind: 'library';
      key: string;
    }
  | {
      kind: 'news';
      key: string;
    }
  | {
      kind: 'blog';
      key: string;
    };

export type LookupInput =
  | {
      type: 'email';
      email: string;
    }
  | {
      type: 'handle';
      handle: string;
    }
  | {
      type: 'id';
      id: string;
      shape: IdShape;
    }
  | {
      type: 'site-link';
      target: SiteTarget;
    }
  | {
      type: 'foreign-link';
    }
  | {
      type: 'unknown-path';
    }
  | {
      type: 'junk';
    };

export function inputKindOf(input: LookupInput): LookupInputKind {
  switch (input.type) {
    case 'site-link':
      return 'site-link';
    case 'foreign-link':
      return 'foreign-link';
    default:
      return input.type;
  }
}

const SITE_HOSTS: ReadonlySet<string> = new Set([new URL(SITE_URL).host, `www.${new URL(SITE_URL).host}`]);

/**
 * The route shapes a pasted link can have. Each maps its first segment (and, for the post routes, the
 * arity) to the thing it names; an unlisted path is "no page with that address".
 */
export function parseSitePath(pathname: string): SiteTarget | null {
  let parts: string[];
  try {
    parts = pathname
      .split('/')
      .filter(Boolean)
      .map((p) => decodeURIComponent(p));
  } catch {
    return null;
  }
  if (parts.length === 0 || parts.some((p) => !SEGMENT.test(p))) return null;
  const [head, a, b, c] = parts;
  const key = a as string;
  switch (head) {
    case 'u':
      if (parts.length === 2)
        return {
          kind: 'user',
          key: key.replace(/^@/, ''),
        };
      if (parts.length === 4 && b === 'post')
        return {
          kind: 'post',
          key: c as string,
        };
      return null;
    case 'thread':
      return parts.length === 2
        ? {
            kind: 'post',
            key,
          }
        : null;
    case 'c':
      return parts.length === 2
        ? {
            kind: 'community',
            key,
          }
        : null;
    case 'tournaments':
      return parts.length === 2
        ? {
            kind: 'tournament',
            key,
          }
        : null;
    case 'jams':
      return parts.length === 2
        ? {
            kind: 'jam',
            key,
          }
        : null;
    case 'create':
      return a === 'builds' && parts.length === 3
        ? {
            kind: 'build',
            key: b as string,
          }
        : null;
    case 'builds':
    case 'user-builds':
      return parts.length === 2
        ? {
            kind: 'build',
            key,
          }
        : null;
    case 'replays':
      return parts.length === 2
        ? {
            kind: 'replay',
            key,
          }
        : null;
    case 'library':
      return parts.length === 2
        ? {
            kind: 'library',
            key,
          }
        : null;
    case 'news':
      return parts.length === 2
        ? {
            kind: 'news',
            key,
          }
        : null;
    case 'blog':
      return parts.length === 2
        ? {
            kind: 'blog',
            key,
          }
        : null;
    default:
      return null;
  }
}

function classifyLink(raw: string): LookupInput {
  let url: URL;
  try {
    url = new URL(raw.startsWith('/') ? `${SITE_URL}${raw}` : raw);
  } catch {
    return {
      type: 'junk',
    };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:')
    return {
      type: 'junk',
    };
  if (!SITE_HOSTS.has(url.host))
    return {
      type: 'foreign-link',
    };
  const target = parseSitePath(url.pathname);
  return target
    ? {
        type: 'site-link',
        target,
      }
    : {
        type: 'unknown-path',
      };
}

/** What a pasted string is. Never fetches anything: a link is only parsed. */
export function classifyLookup(raw: string): LookupInput {
  const q = raw.trim();
  if (q.length === 0 || q.length > MAX_LOOKUP_LENGTH)
    return {
      type: 'junk',
    };
  if (/^https?:\/\//i.test(q) || q.startsWith('/')) {
    // `//host/path` is a protocol-relative link, never a path on this site.
    return q.startsWith('//')
      ? {
          type: 'foreign-link',
        }
      : classifyLink(q);
  }
  const bare = [...SITE_HOSTS].find((h) => q.toLowerCase().startsWith(`${h}/`));
  if (bare) return classifyLink(`https://${q}`);
  if (EMAIL.test(q))
    return {
      type: 'email',
      email: q.toLowerCase(),
    };
  const shape = idShapeOf(q);
  if (shape)
    return {
      type: 'id',
      id: q,
      shape,
    };
  const handle = q.replace(/^@/, '').toLowerCase();
  if (HANDLE_REGEX.test(handle))
    return {
      type: 'handle',
      handle,
    };
  return {
    type: 'junk',
  };
}

/** One question the lookup may ask the database: a unique key on one entity kind. */
export interface LookupCandidate {
  kind: LookupKind;
  by: 'id' | 'handle' | 'email' | 'slug' | 'user-key';
  key: string;
}

/** Kinds an id of the cuid or uuid shape is tried against, in the order results are listed. */
export const STRING_ID_KINDS: readonly LookupKind[] = [
  'user',
  'post',
  'comment',
  'community',
  'event',
  'tournament',
  'build',
  'replay',
  'report',
  'note',
];

const SLUG_KINDS: ReadonlySet<LookupKind> = new Set(['community', 'jam', 'build', 'library', 'news', 'blog']);

/**
 * The unique-key questions to ask for an input, and nothing else: an id is tried only against the
 * kinds whose keys have its shape (a bigint is an outbox event id and nothing more).
 */
export function planLookup(input: LookupInput): LookupCandidate[] {
  switch (input.type) {
    case 'email':
      return [
        {
          kind: 'user',
          by: 'email',
          key: input.email,
        },
      ];
    case 'handle':
      return [
        {
          kind: 'user',
          by: 'handle',
          key: input.handle,
        },
      ];
    case 'id':
      return input.shape === 'bigint'
        ? [
            {
              kind: 'outbox',
              by: 'id',
              key: input.id,
            },
          ]
        : STRING_ID_KINDS.map((kind) => ({
            kind,
            by: 'id' as const,
            key: input.id,
          }));
    case 'site-link': {
      const { kind, key } = input.target;
      if (kind === 'user')
        return [
          {
            kind,
            by: 'user-key',
            key,
          },
        ];
      return [
        {
          kind,
          by: SLUG_KINDS.has(kind) ? 'slug' : 'id',
          key,
        },
      ];
    }
    default:
      return [];
  }
}

/** The first characters of a post or comment, whitespace collapsed, for a result's label. */
export function excerpt(text: string, max = 80): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

/**
 * What the audit row records for a lookup: the input kind and the ids found, never the input itself
 * (an e-mail address is personal data, and a link or handle adds nothing the ids do not say).
 */
export function auditDetail(
  inputKind: LookupInputKind,
  found: ReadonlyArray<{
    kind: LookupKind;
    id: string;
  }>,
): string {
  const ids = found.slice(0, 10).map((r) => `${r.kind}:${r.id}`);
  const more = found.length > ids.length ? ` +${found.length - ids.length}` : '';
  return `input=${inputKind} found=${ids.length ? ids.join(',') : 'none'}${more}`;
}

/**
 * What the one audit row of a batch records: how many items, how many of each input kind and how
 * many matched. Counts only, so no input (least of all an e-mail address) reaches the log.
 */
export function batchAuditDetail(
  items: ReadonlyArray<{
    inputKind: LookupInputKind;
    found: number;
  }>,
): string {
  const kinds: Record<string, number> = {};
  let matched = 0;
  for (const i of items) {
    kinds[i.inputKind] = (kinds[i.inputKind] ?? 0) + 1;
    if (i.found > 0) matched++;
  }
  const list = Object.entries(kinds)
    .map(([k, n]) => `${k}:${n}`)
    .join(',');
  return `items=${items.length} kinds=${list} matched=${matched}`;
}

/** The admin page that acts on a result, with the filters that open it on that result. */
export type LookupAdminTool =
  | {
      tool: 'users';
      q?: string;
      open: string;
    }
  | {
      tool: 'reports';
      status: TriageStatus;
      type?: ReportEntityType;
    }
  | {
      tool: 'builds';
    }
  | {
      tool: 'blog';
    }
  | {
      tool: 'library';
    }
  | {
      tool: 'outbox';
      topic: string;
    };

export interface LookupResult {
  kind: LookupKind;
  id: string;
  /** A name, handle, title or the first 80 characters of a post. Never a message body or an address. */
  label: string;
  createdAt: string | null;
  states: Array<{
    state: LookupState;
    until?: string;
  }>;
  /** The public page's path, when one exists for this kind and state. */
  publicPath: string | null;
  adminTool: LookupAdminTool | null;
  /** A query that opens the thing this result points at (a report's subject, a comment's post). */
  relatedQuery: string | null;
}

export type LookupOutcome =
  | 'found'
  | 'not-found'
  | 'foreign-link'
  | 'unknown-path'
  | 'unrecognised'
  /** Batch only: this item's lookup failed; the others are unaffected. */
  | 'error';

export interface LookupResponse {
  outcome: LookupOutcome;
  inputKind: LookupInputKind;
  results: LookupResult[];
  /** The kinds that were asked about, so "nothing found" says what it looked at. */
  tried: LookupKind[];
}

/** One item of a batch: what was pasted, and the single lookup's answer for it. */
export interface LookupBatchGroup extends LookupResponse {
  input: string;
}

export interface LookupBatchResponse {
  groups: LookupBatchGroup[];
}
