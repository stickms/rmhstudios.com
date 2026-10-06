'use client';

/**
 * A Windows 7 Aero glass window, drawn with 7.css (MIT, khang-nd/7.css) — the
 * real thing: the streaked glass frame, the glowing caption buttons.
 *
 * 7.css is loaded in its scoped build (everything under `.win7`) and the
 * window's CONTENT deliberately sits outside that scope: the `.win7` frame is a
 * backdrop layer behind the panel, and only the title bar (with its caption
 * buttons) lives inside it. 7.css restyles every button, checkbox and input it
 * can reach — its checkboxes even hide the native control and draw on a sibling
 * `<label>` — so letting it reach the page's own controls would break them.
 *
 * The minimise button is real: it rolls the window up to its title bar (and
 * becomes a restore button), with the swoosh. The state is per visit.
 */

import { AnimatePresence, m as motion } from 'framer-motion';
import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { EASE } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { sfx } from './sound';

export function AeroWindow({
  title,
  icon,
  extra,
  bodyClassName,
  bodyStyle,
  children,
}: {
  title: ReactNode;
  icon?: ReactNode;
  /** Rendered in the title bar between the title and the caption buttons. */
  extra?: ReactNode;
  bodyClassName?: string;
  bodyStyle?: React.CSSProperties;
  children: ReactNode;
}) {
  const { t } = useTranslation('c-dunesday');
  const titleId = useId();
  const bodyId = useId();
  const [rolledUp, setRolledUp] = useState(false);

  return (
    <section className={cn('ds-win', rolledUp && 'ds-win--rolled')} aria-labelledby={titleId}>
      <div className="win7 ds-win-frame" aria-hidden="true">
        <div className="window glass active" />
      </div>
      <div className="win7 ds-win-head">
        <div className="title-bar active ds-win-titlebar">
          <div className="title-bar-text ds-win-title">
            {icon}
            <h2 id={titleId}>{title}</h2>
          </div>
          {extra}
          <div className="title-bar-controls">
            <button
              type="button"
              className={rolledUp ? 'is-restore' : 'is-minimize'}
              aria-expanded={!rolledUp}
              aria-controls={bodyId}
              aria-label={
                rolledUp
                  ? t('win-restore', { defaultValue: 'Restore window' })
                  : t('win-minimize', { defaultValue: 'Minimize window' })
              }
              onClick={() => {
                sfx.swoosh();
                setRolledUp((v) => !v);
              }}
            />
          </div>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {!rolledUp && (
          <motion.div
            key="body"
            id={bodyId}
            className="ds-win-bodywrap"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: EASE.emphasized }}
          >
            <div className={cn('ds-window-body ds-win-body', bodyClassName)} style={bodyStyle}>
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
