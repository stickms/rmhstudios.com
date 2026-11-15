import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';

import { SettingsSection } from '@/components/settings/SettingsSection';
import {
  PLAYTIME_PRIVACY_VALUES,
  type PlaytimePrivacy,
} from '@/lib/playtime/privacy';
import { api } from '@/lib/contract/client';
import { setPlaytimePrivacyApi } from '@/lib/playtime/playtime.contract';
import { playtimeSettingsQuery } from '@/lib/settings/privacy.queries';

/**
 * Who may see how long this account has played each game and app: shown in the
 * library's "Friends who play" and "Most played by" lists. Public by default; this
 * is where it is switched off. Saves to /api/settings/playtime-privacy, which is
 * also where it is enforced.
 */
export function PlaytimePrivacyControls() {
  const {
    t,
  } =
    useTranslation(
      'site',
    );
  const {
    data,
    isPending,
  } =
    useQuery(
      playtimeSettingsQuery(),
    );
  // The server's value until the member picks one here.
  const [
    picked,
    setPicked,
  ] =
    useState<PlaytimePrivacy | null>(
      null,
    );
  const value: PlaytimePrivacy =
    picked ??
    data?.playtimePrivacy ??
    'public';
  const setValue =
    setPicked;
  const loaded =
    !isPending;

  function choose(
    next: PlaytimePrivacy,
  ) {
    const previous =
      value;
    setValue(
      next,
    );
    api(
      setPlaytimePrivacyApi,
      {
        body: {
          playtimePrivacy:
            next,
        },
      },
    ).catch(
      () => {
        setValue(
          previous,
        );
        toast.error(
          t(
            'playtime-privacy-save-error',
            {
              defaultValue:
                'Could not save',
            },
          ),
        );
      },
    );
  }

  const LABEL: Record<
    PlaytimePrivacy,
    {
      title: string;
      hint: string;
    }
  > =
    {
      public:
        {
          title:
            t(
              'playtime-privacy-public',
              {
                defaultValue:
                  'Everyone signed in',
              },
            ),
          hint: t(
            'playtime-privacy-public-hint',
            {
              defaultValue:
                'Anyone signed in can see your time on a game or app.',
            },
          ),
        },
      followers:
        {
          title:
            t(
              'playtime-privacy-followers',
              {
                defaultValue:
                  'People who follow me',
              },
            ),
          hint: t(
            'playtime-privacy-followers-hint',
            {
              defaultValue:
                'Only people who follow you can see it.',
            },
          ),
        },
      private:
        {
          title:
            t(
              'playtime-privacy-private',
              {
                defaultValue:
                  'Only me',
              },
            ),
          hint: t(
            'playtime-privacy-private-hint',
            {
              defaultValue:
                'You never appear in anyone’s lists. You still see your own time.',
            },
          ),
        },
    };

  return (
    <SettingsSection
      title={t(
        'playtime-privacy-title',
        {
          defaultValue:
            'Playtime',
        },
      )}
      description={t(
        'playtime-privacy-subtitle',
        {
          defaultValue:
            'Choose who can see how long you have played each game and app.',
        },
      )}
    >
      <fieldset
        disabled={
          !loaded
        }
      >
        <legend className="mb-2 text-sm font-medium text-site-text">
          {t(
            'playtime-privacy-who',
            {
              defaultValue:
                'Who can see my playtime',
            },
          )}
        </legend>
        <div className="flex flex-col gap-1">
          {PLAYTIME_PRIVACY_VALUES.map(
            (
              v,
            ) => (
              <label
                key={
                  v
                }
                className="grid cursor-pointer grid-cols-[auto_1fr] items-start gap-x-3 rounded-site-sm px-3 py-2 hover:bg-site-surface-hover"
              >
                <input
                  type="radio"
                  name="playtime-privacy"
                  value={
                    v
                  }
                  checked={
                    value ===
                    v
                  }
                  onChange={() =>
                    choose(
                      v,
                    )
                  }
                  className="row-span-2 mt-1 accent-site-accent"
                />
                <span className="text-sm text-site-text">
                  {
                    LABEL[
                      v
                    ]
                      .title
                  }
                </span>
                <span className="text-xs text-site-text-muted">
                  {
                    LABEL[
                      v
                    ]
                      .hint
                  }
                </span>
              </label>
            ),
          )}
        </div>
      </fieldset>
    </SettingsSection>
  );
}
