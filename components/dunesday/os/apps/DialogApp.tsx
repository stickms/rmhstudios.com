'use client';

/**
 * A Windows 7 message box: icon, text, OK. Opened through `showMessage()`.
 * Enter or Escape dismisses it, like the real one.
 */

import { useTranslation } from 'react-i18next';
import { sfx } from '../../sound';
import type { AppProps } from '../apps';
import { Icon } from '../icons';
import { useOs } from '../store';
import { useEffect } from 'react';

const ICONS = ['info', 'warning', 'error', 'question'] as const;

export default function DialogApp({ win }: AppProps) {
  const { t } = useTranslation('c-dunesday');
  const close = useOs((s) => s.close);
  const icon = ICONS.find((i) => i === win.params?.icon) ?? 'info';

  useEffect(() => {
    if (icon === 'error' || icon === 'warning') sfx.undo();
    else sfx.bloop();
  }, [icon]);

  return (
    <div className="ds-dialog" role="alert">
      <div className="ds-dialog-body">
        <Icon name={icon} size={32} />
        <p>{win.params?.text}</p>
      </div>
      <div className="ds-dialog-foot">
        <button
          type="button"
          className="ds-btn7"
           
          autoFocus
          onClick={() => close(win.id)}
          onKeyDown={(e) => e.key === 'Escape' && close(win.id)}
        >
          {t('ok', { defaultValue: 'OK' })}
        </button>
      </div>
    </div>
  );
}
