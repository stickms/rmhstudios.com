/**
 * s06-01 — the text for a write or join a community ban or timeout refused.
 *
 * The server answers such a refusal with a machine `code`
 * (`community_banned` / `community_timed_out`) and `endsAt` (ISO, or `null`
 * until lifted) beside its English `error`. The UI builds the sentence from
 * those two fields, so it reads in the member's language and the end is in their
 * locale and time zone, not the server's UTC.
 */
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { HttpError } from '@/lib/http';

type RefusalCode = 'community_banned' | 'community_timed_out';

/** Read `{ code, endsAt }` off a parsed error body or an `HttpError`'s body. */
export function sanctionRefusal(source: unknown): {
  code: RefusalCode;
  endsAt: Date | null;
} | null {
  const body = source instanceof HttpError ? source.body : source;
  if (typeof body !== 'object' || body === null) return null;
  const { code, endsAt } = body as {
    code?: unknown;
    endsAt?: unknown;
  };
  if (code !== 'community_banned' && code !== 'community_timed_out') return null;
  const end = typeof endsAt === 'string' ? new Date(endsAt) : null;
  return {
    code,
    endsAt: end && !Number.isNaN(end.getTime()) ? end : null,
  };
}

/**
 * `(errorOrBody) => text | null`: the translated refusal, or `null` when it is not a sanction refusal.
 *
 * s10-20: the sentence now comes from `useRefusalText` (the `COMMUNITY_BANNED` and `COMMUNITY_TIMED_OUT` cases keep
 * their `community-bans` keys, so every catalogue string is the one it was); this hook only decides whether a body is
 * a sanction refusal at all.
 */
export function useSanctionRefusal(): (source: unknown) => string | null {
  // Keeps the `community-bans` namespace loading for the sentences `useRefusalText` renders from it.
  useTranslation('community-bans');
  const refusalText = useRefusalText();
  return useCallback(
    (source: unknown) => (sanctionRefusal(source) ? (refusalText.maybe(source) ?? null) : null),
    [refusalText],
  );
}
