'use client';

import { useEffect, useState } from 'react';
import { Gamepad2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { SettingsSection } from '@/components/settings/SettingsSection';
import {
  PLAYTIME_PRIVACY_VALUES,
  isPlaytimePrivacy,
  type PlaytimePrivacy,
} from '@/lib/playtime/privacy';

/**
 * Who may see how long this account has played each game and app: shown in the
 * library's "Friends who play" and "Most played by" lists. Public by default; this
 * is where it is switched off. Saves to /api/settings/playtime-privacy, which is
 * also where it is enforced.
 */
export function PlaytimePrivacyControls() {
  const { t } = useTranslation('site');
  const [value, setValue] = useState<PlaytimePrivacy>('public');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/settings/playtime-privacy', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { playtimePrivacy?: unknown } | null) => {
        if (d && isPlaytimePrivacy(d.playtimePrivacy)) setValue(d.playtimePrivacy);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  function choose(next: PlaytimePrivacy) {
    const previous = value;
    setValue(next);
    fetch('/api/settings/playtime-privacy', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ playtimePrivacy: next }),
    })
      .then((r) => {
        if (!r.ok) throw new Error('save failed');
      })
      .catch(() => {
        setValue(previous);
        toast.error(t('playtime-privacy-save-error', { defaultValue: 'Could not save' }));
      });
  }

  const LABEL: Record<PlaytimePrivacy, { title: string; hint: string }> = {
    public: {
      title: t('playtime-privacy-public', { defaultValue: 'Everyone signed in' }),
      hint: t('playtime-privacy-public-hint', {
        defaultValue: 'Anyone signed in can see your time on a game or app.',
      }),
    },
    followers: {
      title: t('playtime-privacy-followers', { defaultValue: 'People who follow me' }),
      hint: t('playtime-privacy-followers-hint', {
        defaultValue: 'Only people who follow you can see it.',
      }),
    },
    private: {
      title: t('playtime-privacy-private', { defaultValue: 'Only me' }),
      hint: t('playtime-privacy-private-hint', {
        defaultValue: 'You never appear in anyone’s lists. You still see your own time.',
      }),
    },
  };

  return (
    <SettingsSection
      icon={Gamepad2}
      title={t('playtime-privacy-title', { defaultValue: 'Playtime' })}
      description={t('playtime-privacy-subtitle', {
        defaultValue: 'Choose who can see how long you have played each game and app.',
      })}
    >
      <fieldset disabled={!loaded}>
        <legend className="mb-2 text-sm font-medium text-site-text">
          {t('playtime-privacy-who', { defaultValue: 'Who can see my playtime' })}
        </legend>
        <div className="flex flex-col gap-1">
          {PLAYTIME_PRIVACY_VALUES.map((v) => (
            <label
              key={v}
              className="grid cursor-pointer grid-cols-[auto_1fr] items-start gap-x-3 rounded-site-sm px-3 py-2 hover:bg-site-surface-hover"
            >
              <input
                type="radio"
                name="playtime-privacy"
                value={v}
                checked={value === v}
                onChange={() => choose(v)}
                className="row-span-2 mt-1 accent-site-accent"
              />
              <span className="text-sm text-site-text">{LABEL[v].title}</span>
              <span className="text-xs text-site-text-muted">{LABEL[v].hint}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </SettingsSection>
  );
}
