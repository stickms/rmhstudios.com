'use client';

/** winver: the About Dunesday 7 box. */

import { useTranslation } from 'react-i18next';
import { DUNESDAY } from '@/lib/dunesday/titles';
import { byteSize, QUOTA_BYTES } from '@/lib/dunesday/vfs';
import type { AppProps } from '../apps';
import { useOs } from '../store';
import { useProfile } from '../useProfile';

export default function AboutApp({ win }: AppProps) {
  const { t } = useTranslation('c-dunesday');
  const close = useOs((s) => s.close);
  const vfs = useOs((s) => s.vfs);
  const profile = useProfile();
  const used = byteSize(vfs);

  return (
    <div className="ds-about">
      <div className="ds-about-banner" aria-hidden="true">
        <span className="ds-orb7 ds-orb7--static">
          <span className="ds-orb7-flag" />
        </span>
        <span className="ds-about-word">
          Dunesday<b>7</b>
          <small>Ultimate</small>
        </span>
      </div>
      <hr />
      <p>
        {t('about-version', {
          defaultValue: 'Dunesday 7 · Version 6.1 (Build 7601: Service Pack Doomsday)',
        })}
        <br />
        {t('about-copyright', {
          defaultValue:
            '© RMH Studios. A fan-made marathon planner; not affiliated with Microsoft, Marvel or Legendary.',
        })}
      </p>
      <p>
        {t('about-licensed', { defaultValue: 'This product is licensed to:' })}
        <br />
        <strong>{profile.name}</strong>
      </p>
      <p>
        {t('about-target', { defaultValue: 'Countdown target: {{date}}', date: DUNESDAY })}
        <br />
        {t('about-storage', {
          defaultValue: 'Sandbox storage: {{used}} KB of {{total}} KB used',
          used: Math.ceil(used / 1024),
          total: QUOTA_BYTES / 1024,
        })}
      </p>
      <p className="ds-about-credits">
        {t('about-credits', {
          defaultValue:
            'Window frames from 7.css by Khang Nguyen (MIT). Icons drawn for Dunesday 7.',
        })}
      </p>
      <div className="ds-dialog-foot">
        <button
          type="button"
          className="ds-btn7"
           
          autoFocus
          onClick={() => close(win.id)}
        >
          {t('ok', { defaultValue: 'OK' })}
        </button>
      </div>
    </div>
  );
}
