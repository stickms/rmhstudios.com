import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Phone } from 'lucide-react';
import { toast } from 'sonner';

import { SettingsSection } from '@/components/settings/SettingsSection';
import { Button } from '@/components/ui/button';
import {
  CALL_PRIVACY_VALUES,
  DEFAULT_CALL_PRIVACY,
  isCallPrivacy,
  type CallPrivacy,
} from '@/lib/call/state';
import { api } from '@/lib/contract/client';
import {
  getCallPrivacyApi,
  listCallMutesApi,
  setCallPrivacyApi,
  unmuteCallerApi,
} from '@/lib/call/calls.contract';

interface ActiveMute {
  until: string;
  user: { id: string; name: string | null; handle: string | null };
}

/**
 * CallPrivacyControls — who may ring this account. Sits in Settings → Privacy
 * beside presence. Saves to /api/calls/privacy; the rule itself is enforced on
 * the socket hub (a block still beats every option here), never in this form.
 */
export function CallPrivacyControls() {
  const { t } = useTranslation('site');
  const [value, setValue] = useState<CallPrivacy>(DEFAULT_CALL_PRIVACY);
  const [loaded, setLoaded] = useState(false);
  const [mutes, setMutes] = useState<ActiveMute[]>([]);

  // People muted from the incoming-call banner. Listed here so a mute is never
  // something you can set and then not find again.
  useEffect(() => {
    api(listCallMutesApi, { retries: 0 })
      .then((d) => {
        if (d?.mutes) setMutes(d.mutes);
      })
      .catch(() => {});
  }, []);

  function unmute(targetUserId: string) {
    const previous = mutes;
    setMutes((list) => list.filter((m) => m.user.id !== targetUserId));
    api(unmuteCallerApi, { body: { targetUserId } })
      .catch(() => {
        setMutes(previous);
        toast.error(t('call-privacy-save-error', { defaultValue: 'Could not save' }));
      });
  }

  useEffect(() => {
    api(getCallPrivacyApi, { retries: 0 })
      .catch(() => null)
      .then((d: { callPrivacy?: unknown } | null) => {
        if (d && isCallPrivacy(d.callPrivacy)) setValue(d.callPrivacy);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  function choose(next: CallPrivacy) {
    const previous = value;
    setValue(next);
    api(setCallPrivacyApi, { body: { callPrivacy: next } })
      .catch(() => {
        // Put the radio back: showing a setting that did not save is worse than
        // showing the old one.
        setValue(previous);
        toast.error(t('call-privacy-save-error', { defaultValue: 'Could not save' }));
      });
  }

  const LABEL: Record<CallPrivacy, { title: string; hint: string }> = {
    mutuals: {
      title: t('call-privacy-mutuals', { defaultValue: 'Mutuals' }),
      hint: t('call-privacy-mutuals-hint', {
        defaultValue: 'Only people you follow who also follow you.',
      }),
    },
    everyone: {
      title: t('call-privacy-everyone', { defaultValue: 'Everyone' }),
      hint: t('call-privacy-everyone-hint', {
        defaultValue: 'Anyone can ring you, unless you have blocked them.',
      }),
    },
    nobody: {
      title: t('call-privacy-nobody', { defaultValue: 'No one' }),
      hint: t('call-privacy-nobody-hint', {
        defaultValue: 'Nobody can call you. You can still call others.',
      }),
    },
  };

  return (
    <SettingsSection
      icon={Phone}
      title={t('call-privacy-title', { defaultValue: 'Calls' })}
      description={t('call-privacy-subtitle', {
        defaultValue: 'Choose who can ring you. People you have blocked can never call.',
      })}
    >
      <fieldset disabled={!loaded}>
        <legend className="mb-2 text-sm font-medium text-site-text">
          {t('call-privacy-who', { defaultValue: 'Who can call me' })}
        </legend>
        <div className="flex flex-col gap-1">
          {CALL_PRIVACY_VALUES.map((v) => (
            <label
              key={v}
              className="grid cursor-pointer grid-cols-[auto_1fr] items-start gap-x-3 rounded-site-sm px-3 py-2 hover:bg-site-surface-hover"
            >
              <input
                type="radio"
                name="call-privacy"
                value={v}
                checked={value === v}
                onChange={() => choose(v)}
                className="mt-1 accent-site-accent"
              />
              <span className="text-sm text-site-text">{LABEL[v].title}</span>
              <span className="col-start-2 text-xs text-site-text-muted">{LABEL[v].hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {mutes.length > 0 && (
        <div className="border-t border-site-border pt-3">
          <p className="mb-2 text-sm font-medium text-site-text">
            {t('call-mutes-heading', { defaultValue: 'Muted callers' })}
          </p>
          <ul className="flex flex-col gap-1">
            {mutes.map((m) => {
              const who = m.user.name || m.user.handle || t('someone', { defaultValue: 'Someone' });
              return (
                <li key={m.user.id} className="flex items-center justify-between gap-3 px-3 py-1">
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-site-text">{who}</span>
                    <span className="block text-xs text-site-text-muted">
                      {t('call-mutes-until', {
                        defaultValue: 'Until {{time}}',
                        time: new Date(m.until).toLocaleString(undefined, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }),
                      })}
                    </span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => unmute(m.user.id)}
                    aria-label={t('call-mutes-unmute-aria', {
                      defaultValue: 'Unmute {{name}}',
                      name: who,
                    })}
                  >
                    {t('call-mutes-unmute', { defaultValue: 'Unmute' })}
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </SettingsSection>
  );
}
