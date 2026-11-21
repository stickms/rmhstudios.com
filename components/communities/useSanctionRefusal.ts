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
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { HttpError } from '@/lib/http';

type RefusalCode =
  | 'community_banned'
  | 'community_timed_out';

/** Read `{ code, endsAt }` off a parsed error body or an `HttpError`'s body. */
export function sanctionRefusal(
  source: unknown,
): {
  code: RefusalCode;
  endsAt: Date | null;
} | null {
  const body =
    source instanceof
    HttpError
      ? source.body
      : source;
  if (
    typeof body !==
      'object' ||
    body ===
      null
  )
    return null;
  const {
    code,
    endsAt,
  } =
    body as {
      code?: unknown;
      endsAt?: unknown;
    };
  if (
    code !==
      'community_banned' &&
    code !==
      'community_timed_out'
  )
    return null;
  const end =
    typeof endsAt ===
    'string'
      ? new Date(
          endsAt,
        )
      : null;
  return {
    code,
    endsAt:
      end &&
      !Number.isNaN(
        end.getTime(),
      )
        ? end
        : null,
  };
}

/** `(errorOrBody) => text | null`: the translated refusal, or `null` when it is not a sanction refusal. */
export function useSanctionRefusal(): (
  source: unknown,
) =>
  | string
  | null {
  const {
    t,
  } =
    useTranslation(
      'community-bans',
    );
  const fmt =
    useLocaleFormat();
  return useCallback(
    (
      source: unknown,
    ) => {
      const refusal =
        sanctionRefusal(
          source,
        );
      if (
        !refusal
      )
        return null;
      const end =
        refusal.endsAt;
      if (
        refusal.code ===
        'community_timed_out'
      ) {
        return end
          ? t(
              'refusal-timeout-until',
              {
                date: fmt.dateTime(
                  end,
                ),
                defaultValue:
                  'You are timed out of this community until {{date}}. You can read but not post.',
              },
            )
          : t(
              'refusal-timeout-open',
              {
                defaultValue:
                  'You are timed out of this community. You can read but not post.',
              },
            );
      }
      return end
        ? t(
            'refusal-ban-until',
            {
              date: fmt.dateTime(
                end,
              ),
              defaultValue:
                'You are banned from this community until {{date}}.',
            },
          )
        : t(
            'refusal-ban-open',
            {
              defaultValue:
                'You are banned from this community until a moderator lifts it.',
            },
          );
    },
    [
      t,
      fmt,
    ],
  );
}
