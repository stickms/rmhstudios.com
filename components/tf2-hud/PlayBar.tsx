/** The strip above the preview in Play mode: the keys, a way back through the screens, and a way out. */
'use client';

import { ArrowLeft, Square } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PLAY_KEYS } from '@/lib/tf2-hud/play/sim';
import { useEditor } from '@/lib/tf2-hud/store';
import { Btn } from './ui';

export default function PlayBar({ inGame }: { inGame: boolean }) {
  const { t } = useTranslation('c-tf2-hud');
  const canGoBack = useEditor((s) => s.playStack.length > 0 || s.pageId !== 'gameplay');
  const playBack = useEditor((s) => s.playBack);
  const setPlay = useEditor((s) => s.setPlay);

  const labels: Record<string, string> = {
    'Switch weapon': t('play-key-weapon', { defaultValue: 'Switch weapon' }),
    Fire: t('play-key-fire', { defaultValue: 'Fire' }),
    Reload: t('play-key-reload', { defaultValue: 'Reload' }),
    'Take damage': t('play-key-damage', { defaultValue: 'Take damage' }),
    Heal: t('play-key-heal', { defaultValue: 'Heal' }),
    'Die / respawn': t('play-key-die', { defaultValue: 'Die / respawn' }),
    'Kill (streak)': t('play-key-kill', { defaultValue: 'Kill (streak)' }),
    'Target ID': t('play-key-target', { defaultValue: 'Target ID' }),
    Alert: t('play-key-alert', { defaultValue: 'Alert' }),
  };

  return (
    <div
      role="region"
      aria-label={t('play-bar', { defaultValue: 'Play mode' })}
      className="sticky top-0 z-10 mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-(--app-radius-sm) border border-(--app-border-bright) bg-(--app-bg) px-2 py-1.5 text-xs"
    >
      <span className="font-semibold text-(--app-accent-text)">
        {t('play-bar', { defaultValue: 'Play mode' })}
      </span>
      {canGoBack ? (
        <Btn size="xs" icon={ArrowLeft} onClick={playBack}>
          {t('play-back', { defaultValue: 'Back' })}
        </Btn>
      ) : null}
      {inGame ? (
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-(--app-text-muted)">
          {PLAY_KEYS.map((k) => (
            <li key={k.key}>
              <kbd className="rounded-(--app-radius-sm) bg-(--app-surface-hover) px-1 font-mono text-[11px] text-(--app-text)">
                {k.key}
              </kbd>{' '}
              {labels[k.label] ?? k.label}
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-(--app-text-muted)">
          {t('play-menu-hint', { defaultValue: 'Click the buttons.' })}
        </span>
      )}
      <Btn size="xs" icon={Square} className="ms-auto" onClick={() => setPlay(false)}>
        {t('play-exit', { defaultValue: 'Exit (Esc)' })}
      </Btn>
    </div>
  );
}
