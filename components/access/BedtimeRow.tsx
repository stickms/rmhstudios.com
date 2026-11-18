/**
 * Bedtime mode, set where its schedule is set: under Quiet hours on /settings/notifications. It used to live on
 * Appearance, a page away from the hours it runs on, with a link back here when they were missing.
 *
 * Per-device (localStorage `rmh-access`, read by the pre-paint script); the quiet hours it follows are mirrored onto
 * the device by NotificationSettings whenever they load or change.
 */

import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Switch } from '@/components/ui/switch';
import { useAccessPrefs } from '@/lib/access/use-access-prefs';
import { setAccessPrefs } from '@/lib/access/prefs';

export function BedtimeRow({
  hasQuietHours,
}: {
  hasQuietHours: boolean;
}) {
  const {
    t,
  } =
    useTranslation(
      'f-access',
    );
  const p =
    useAccessPrefs();
  const id =
    useId();
  return (
    <div className="settings-row">
      <span className="settings-row__text">
        <span
          id={
            id
          }
          className="settings-row__name block"
        >
          {t(
            'bedtime-label',
            {
              defaultValue:
                'Bedtime mode',
            },
          )}
        </span>
        <span className="settings-row__hint block">
          {hasQuietHours
            ? t(
                'bedtime-desc',
                {
                  defaultValue:
                    'Dim and soften colours during your quiet hours.',
                },
              )
            : t(
                'bedtime-needs-hours',
                {
                  defaultValue:
                    'Dims and softens colours during the quiet hours above, once you set them.',
                },
              )}
        </span>
      </span>
      <Switch
        checked={
          p.bedtime
        }
        onCheckedChange={(
          v,
        ) =>
          setAccessPrefs(
            {
              bedtime:
                v,
            },
          )
        }
        aria-labelledby={
          id
        }
      />
    </div>
  );
}
