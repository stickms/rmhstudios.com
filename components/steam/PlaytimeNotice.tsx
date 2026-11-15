import {
  useEffect,
  useState,
} from 'react';
import { Link } from '@tanstack/react-router';
import { Eye } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/components/Providers';
import { shouldShowNotice } from '@/lib/playtime/privacy';
import { api } from '@/lib/contract/client';
import {
  dismissPlaytimeNoticeApi,
  getPlaytimeSettingsApi,
} from '@/lib/playtime/playtime.contract';
import type { ResOf } from '@/lib/contract/endpoint';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';

type Settings =
  ResOf<
    typeof getPlaytimeSettingsApi
  >;

/**
 * The one-time notice that playtime is visible, as Steam's blue banner. Playtime is
 * public by default (opt out), so an existing account becomes visible without doing
 * anything; this says so once, links to the setting, and stays gone once dismissed.
 */
export function PlaytimeNotice() {
  const {
    t,
  } =
    useTranslation(
      'games-hub',
    );
  const {
    data: session,
  } =
    useSession();
  const signedIn =
    !!session?.user;
  const [
    settings,
    setSettings,
  ] =
    useState<Settings | null>(
      null,
    );
  const arrival =
    useArrival(
      settings !==
        null,
    );

  useEffect(() => {
    if (
      !signedIn
    )
      return;
    let cancelled = false;
    api(
      getPlaytimeSettingsApi,
    )
      .then(
        (
          d,
        ) => {
          if (
            !cancelled
          )
            setSettings(
              d,
            );
        },
      )
      .catch(
        () => {},
      );
    return () => {
      cancelled = true;
    };
  }, [
    signedIn,
  ]);

  if (
    !settings ||
    !shouldShowNotice(
      {
        signedIn,
        noticeDismissed:
          settings.noticeDismissed,
        privacy:
          settings.playtimePrivacy,
      },
    )
  ) {
    return null;
  }

  function dismiss() {
    setSettings(
      (
        s,
      ) =>
        s
          ? {
              ...s,
              noticeDismissed: true,
            }
          : s,
    );
    api(
      dismissPlaytimeNoticeApi,
      {
        body: {
          dismissNotice: true,
        },
      },
    ).catch(
      () => {},
    );
  }

  return (
    <aside
      className={cn(
        'stm-notice',
        arrival,
      )}
      aria-label={t(
        'playtime-notice-label',
        {
          defaultValue:
            'Playtime visibility',
        },
      )}
    >
      <Eye
        aria-hidden
      />
      <p>
        {t(
          'playtime-notice-body',
          {
            defaultValue:
              'Your playtime is now visible to other signed-in members. You can change who sees it.',
          },
        )}
      </p>
      <Link
        to="/settings/privacy"
        className="stm-btn stm-btn-ghost"
      >
        {t(
          'playtime-notice-change',
          {
            defaultValue:
              'Change',
          },
        )}
      </Link>
      <button
        type="button"
        className="stm-btn stm-btn-ghost"
        onClick={
          dismiss
        }
      >
        {t(
          'playtime-notice-dismiss',
          {
            defaultValue:
              'Got it',
          },
        )}
      </button>
    </aside>
  );
}
