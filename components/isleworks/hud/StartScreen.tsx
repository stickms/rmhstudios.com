'use client';

/**
 * Isleworks — the title screen.
 *
 * Deliberately one screen with two buttons and a control list. A city builder's
 * opening menu is the last thing a player wants to read, so this one exists to
 * do exactly three jobs: say what the game is, offer the save if there is one,
 * and put the camera keys where they can be found again from the pause state.
 *
 * The island is already rendering behind it — the panel is translucent — so the
 * first thing anyone sees is the game, not a splash.
 */

import { Play, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { isleworksSave, summarizeIsleworksSave } from '@/lib/isleworks/cloud';
import { useIsleworks } from '@/lib/isleworks/store';
import { useCloudSave } from '@/hooks/useCloudSave';

export function StartScreen() {
  const { t, i18n } = useTranslation('c-isleworks');
  const start = useIsleworks((s) => s.start);

  // The city can be in two places — this browser and the account — and the
  // Continue button has to offer the one that would actually be loaded. Reading
  // the stored payload rather than rebuilding a `CityState` also drops a full
  // simulation rebuild from the title screen's mount.
  const cloud = useCloudSave(isleworksSave, {
    gameName: 'Isleworks',
    summarize: (save) => summarizeIsleworksSave(save, t, i18n.language),
  });
  const saved = cloud.status === 'ready' ? cloud.save : null;

  return (
    <div className="isw-title">
      {cloud.conflictDialog}
      <div className="isw-panel isw-title-card">
        <div>
          <h1 className="isw-title-name">{t('title', { defaultValue: 'Isleworks' })}</h1>
          <p className="isw-title-tag">
            {t('tagline', {
              defaultValue:
                'A floating island, a square grid, and one rule: nothing works until it touches a road. Grow a tidy little city out of roads, homes, jobs, power and parks — and keep everyone happy while you do it.',
            })}
          </p>
        </div>

        <div className="isw-title-actions">
          {saved && (
            <button
              type="button"
              className="isw-btn isw-btn--primary"
              style={{ height: 40, padding: '0 18px', fontSize: 13 }}
              onClick={() => start({ fresh: false, saved })}
            >
              <Play size={15} aria-hidden />
              {t('continue', {
                defaultValue: 'Continue — month {{month}}, {{population}} residents',
                month: saved.month,
                population: saved.population,
              })}
            </button>
          )}
          <button
            type="button"
            className={saved ? 'isw-btn' : 'isw-btn isw-btn--primary'}
            style={{ height: 40, padding: '0 18px', fontSize: 13 }}
            onClick={() => start({ fresh: true })}
          >
            <RotateCcw size={15} aria-hidden />
            {saved
              ? t('new-island', { defaultValue: 'New island' })
              : t('start', { defaultValue: 'Found a city' })}
          </button>
        </div>

        <Controls />
      </div>
    </div>
  );
}

export function Controls() {
  const { t } = useTranslation('c-isleworks');
  const rows: { keys: string[]; label: string }[] = [
    { keys: ['Drag'], label: t('help-pan', { defaultValue: 'Pan the island' }) },
    { keys: ['Scroll'], label: t('help-zoom', { defaultValue: 'Zoom' }) },
    { keys: ['Q', 'E'], label: t('help-rotate', { defaultValue: 'Turn the camera' }) },
    { keys: ['W', 'A', 'S', 'D'], label: t('help-move', { defaultValue: 'Move the view' }) },
    { keys: ['R'], label: t('help-rotate-piece', { defaultValue: 'Rotate what you are placing' }) },
    { keys: ['Esc'], label: t('help-cancel', { defaultValue: 'Put the tool down' }) },
    { keys: ['Space'], label: t('help-pause', { defaultValue: 'Pause and resume' }) },
    { keys: ['1', '2', '3'], label: t('help-speed', { defaultValue: 'Game speed' }) },
  ];

  return (
    <div className="isw-keys">
      {rows.map((row) => (
        <div key={row.label}>
          {row.keys.map((key) => (
            <kbd key={key} className="isw-key">
              {key}
            </kbd>
          ))}
          {row.label}
        </div>
      ))}
    </div>
  );
}
