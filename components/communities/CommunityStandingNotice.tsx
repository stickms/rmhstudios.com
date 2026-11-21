/** s06-01 — the one-line notice a banned or timed-out member sees on the community page, and the hook that reads it. */
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiQuery } from '@/lib/contract/client';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { myStandingApi } from '@/lib/communities/bans.contract';
import {
  standingNoticeKey,
  type MyStandingDTO,
} from '@/lib/communities/bans';

/** The caller's own active sanction in this community (`null` while loading, when signed out, or when none applies). */
export function useMyStanding(
  slug: string,
  enabled: boolean,
): MyStandingDTO | null {
  const query = useQuery({
    ...apiQuery(myStandingApi, { params: { slug } }),
    enabled,
    retry: false,
  });
  // No notice is better than a wrong one (an error reads as none); the server still enforces.
  return enabled && !query.isError ? (query.data?.standing ?? null) : null;
}

/** A line of text on a rule (no tinted box). A timeout replaces the composer; a ban replaces the Join button. */
export function CommunityStandingNotice({
  standing,
}: {
  standing: MyStandingDTO | null;
}) {
  const {
    t,
  } =
    useTranslation(
      'community-bans',
    );
  const fmt =
    useLocaleFormat();
  if (
    !standing
  )
    return null;
  const end =
    standing.endsAt
      ? new Date(
          standing.endsAt,
        )
      : null;
  const key =
    standingNoticeKey(
      standing.kind,
      end,
    );
  const text =
    key ===
    'notice-timeout-until'
      ? t(
          'notice-timeout-until',
          {
            date: end
              ? fmt.dateTime(
                  end,
                )
              : '',
            defaultValue:
              'You are timed out until {{date}}. You can read but not post.',
          },
        )
      : key ===
          'notice-timeout-open'
        ? t(
            'notice-timeout-open',
            {
              defaultValue:
                'You are timed out until a moderator lifts it. You can read but not post.',
            },
          )
        : key ===
            'notice-ban-until'
          ? t(
              'notice-ban-until',
              {
                date: end
                  ? fmt.date(
                      end,
                    )
                  : '',
                defaultValue:
                  'You are banned from this community until {{date}}.',
              },
            )
          : t(
              'notice-ban-open',
              {
                defaultValue:
                  'You are banned from this community until a moderator lifts it.',
              },
            );
  return (
    <p
      role="status"
      className="t-body border-b border-site-border px-4 py-3 text-site-text"
    >
      {
        text
      }
    </p>
  );
}
