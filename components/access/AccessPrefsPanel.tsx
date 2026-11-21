import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';

import { Switch } from '@/components/ui/switch';
import { useAccessPrefs } from '@/lib/access/use-access-prefs';
import { setAccessPrefs, SHAKE_OK_KEY, type AccessPrefs } from '@/lib/access/prefs';
import { formatNumberPref } from '@/lib/access/format';
import { isTouchPhone, motionPermissionGated, requestMotionPermission } from '@/lib/access/shake';
import { activityNotificationsSupported } from '@/lib/access/activity';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { Select } from '@/components/ui/select';

/** One group on the Appearance spine: the shared settings section, so this panel spaces like every other. */
function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <SettingsSection title={title} description={description}>
      {children}
    </SettingsSection>
  );
}

/** One choice as a settings row: the name at the start, a dropdown of the options at the end. */
function Seg<K extends keyof AccessPrefs>({
  field,
  label,
  options,
  value,
}: {
  field: K;
  label: string;
  options: {
    id: AccessPrefs[K] & string;
    label: string;
  }[];
  value: AccessPrefs[K] & string;
}) {
  const id = useId();
  return (
    <div className="settings-row">
      <span id={id} className="settings-row__name">
        {label}
      </span>
      <Select
        value={value}
        onChange={(e) =>
          setAccessPrefs({
            [field]: e.target.value,
          } as Partial<AccessPrefs>)
        }
        aria-labelledby={id}
        controlSize="sm"
        containerClassName="w-36 shrink-0 sm:w-40"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </Select>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="settings-row">
      <span className="settings-row__text">
        <span id={id} className="settings-row__name block">
          {label}
        </span>
        <span className="settings-row__hint block">{description}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} aria-labelledby={id} />
    </div>
  );
}

/**
 * Settings for the access & comfort additions (text spacing, formats, captions,
 * shake-to-report, running-timer notification; bedtime mode moved beside quiet hours, BedtimeRow). Everything is
 * per-device (localStorage) and applied immediately; nothing here needs an account.
 */
export function AccessPrefsPanel() {
  const { t } = useTranslation('f-access');
  const p = useAccessPrefs();
  const [phone, setPhone] = useState(false);
  // Notification support is a browser fact: false on the server, so it is read
  // after hydration like `phone` — rendering it directly mismatches the SSR HTML.
  const [activityOk, setActivityOk] = useState(false);
  useEffect(() => {
    setPhone(isTouchPhone());
    setActivityOk(activityNotificationsSupported());
  }, []);

  async function onShake(next: boolean) {
    if (next && motionPermissionGated()) {
      const ok = await requestMotionPermission();
      if (!ok) {
        toast.error(
          t('shake-denied', {
            defaultValue: 'Motion access was not allowed.',
          }),
        );
        return;
      }
      try {
        localStorage.setItem(SHAKE_OK_KEY, '1');
      } catch {
        /* storage unavailable */
      }
    }
    setAccessPrefs({
      shake: next,
    });
  }

  async function onActivity(next: boolean) {
    if (next && Notification.permission !== 'granted') {
      const res = await Notification.requestPermission();
      if (res !== 'granted') {
        toast.error(
          t('activity-denied', {
            defaultValue: 'Notifications are blocked for this site.',
          }),
        );
        return;
      }
    }
    setAccessPrefs({
      activity: next,
    });
  }

  const spacingOpts = [
    {
      id: 'off' as const,
      label: t('spacing-off', {
        defaultValue: 'Default',
      }),
    },
    {
      id: 'relaxed' as const,
      label: t('spacing-relaxed', {
        defaultValue: 'Relaxed',
      }),
    },
    {
      id: 'wide' as const,
      label: t('spacing-wide', {
        defaultValue: 'Wide',
      }),
    },
  ];
  const auto = t('opt-auto', {
    defaultValue: 'Auto',
  });

  return (
    <>
      <Section
        title={t('spacing-title', {
          defaultValue: 'Text spacing',
        })}
        description={t('spacing-desc', {
          defaultValue: 'Loosen line height, letter spacing and word spacing across the site.',
        })}
      >
        <Seg
          field="spacing"
          label={t('spacing-label', {
            defaultValue: 'Spacing',
          })}
          options={spacingOpts}
          value={p.spacing}
        />
      </Section>

      <Section
        title={t('formats-title', {
          defaultValue: 'Formats',
        })}
        description={t('formats-desc-week-numbers', {
          defaultValue: 'Week start and number style, independent of your language.',
        })}
      >
        <Seg
          field="weekStart"
          label={t('week-label', {
            defaultValue: 'Week starts on',
          })}
          options={[
            {
              id: 'auto',
              label: auto,
            },
            {
              id: '0',
              label: t('week-sun', {
                defaultValue: 'Sunday',
              }),
            },
            {
              id: '1',
              label: t('week-mon', {
                defaultValue: 'Monday',
              }),
            },
            {
              id: '6',
              label: t('week-sat', {
                defaultValue: 'Saturday',
              }),
            },
          ]}
          value={p.weekStart}
        />
        <Seg
          field="numberFormat"
          label={t('number-label', {
            defaultValue: 'Numbers',
          })}
          options={[
            {
              id: 'auto',
              label: auto,
            },
            {
              id: 'en-US',
              label: '1,234.5',
            },
            {
              id: 'de-DE',
              label: '1.234,5',
            },
            {
              id: 'fr-FR',
              label: '1 234,5',
            },
            {
              id: 'en-IN',
              label: '12,34,567.8',
            },
          ]}
          value={p.numberFormat}
        />
        <p className="settings-row__hint py-2">
          {t('formats-preview-number', {
            defaultValue: 'Preview: {{number}}',
            number: formatNumberPref(1234567.8, p, {
              maximumFractionDigits: 1,
            }),
          })}
        </p>
      </Section>

      <Section
        title={t('captions-title', {
          defaultValue: 'Captions',
        })}
        description={t('captions-desc', {
          defaultValue: 'Size and background for WebVTT captions on videos that have them.',
        })}
      >
        <Seg
          field="captionSize"
          label={t('caption-size', {
            defaultValue: 'Size',
          })}
          options={[
            {
              id: 'sm',
              label: t('size-sm', {
                defaultValue: 'Small',
              }),
            },
            {
              id: 'md',
              label: t('size-md', {
                defaultValue: 'Medium',
              }),
            },
            {
              id: 'lg',
              label: t('size-lg', {
                defaultValue: 'Large',
              }),
            },
            {
              id: 'xl',
              label: t('size-xl', {
                defaultValue: 'Huge',
              }),
            },
          ]}
          value={p.captionSize}
        />
        <Seg
          field="captionBg"
          label={t('caption-bg', {
            defaultValue: 'Background',
          })}
          options={[
            {
              id: 'none',
              label: t('bg-none', {
                defaultValue: 'None',
              }),
            },
            {
              id: 'dim',
              label: t('bg-dim', {
                defaultValue: 'Dim',
              }),
            },
            {
              id: 'solid',
              label: t('bg-solid', {
                defaultValue: 'Solid',
              }),
            },
          ]}
          value={p.captionBg}
        />
        <div className="py-4 text-center">
          <span
            className="inline-block rounded-site-sm px-2 py-1"
            style={{
              background: 'var(--rmh-cue-bg)',
              color: 'white',
              fontSize: 'calc(1rem * var(--rmh-cue-scale, 1))',
            }}
          >
            {t('caption-sample', {
              defaultValue: 'This is how captions will look.',
            })}
          </span>
        </div>
      </Section>

      <Section
        title={t('more-title', {
          defaultValue: 'Comfort & reminders',
        })}
      >
        {phone ? (
          <ToggleRow
            label={t('shake-label', {
              defaultValue: 'Shake to report a problem',
            })}
            description={t('shake-desc', {
              defaultValue: 'Shake your phone to open the feedback sheet. Off inside games.',
            })}
            checked={p.shake}
            onChange={(v) => void onShake(v)}
          />
        ) : null}
        {activityOk ? (
          <ToggleRow
            label={t('activity-label', {
              defaultValue: 'Show my study timer in notifications',
            })}
            description={t('activity-desc', {
              defaultValue: 'A single notification for a running RMHStudy timer, updated when the phase changes.',
            })}
            checked={p.activity}
            onChange={(v) => void onActivity(v)}
          />
        ) : null}
      </Section>
    </>
  );
}
