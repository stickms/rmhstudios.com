'use client';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PuzzleCategory } from '@/lib/synapse-storm/types';

/** Every category a custom storm can draw from, in the order the menu lists them. */
export const CUSTOM_STORM_CATEGORIES: PuzzleCategory[] = [
  'math',
  'pattern',
  'language',
  'spatial',
  'reaction',
  'memory',
  'minigame',
  'fling',
  'meta',
  'powerup',
];

const STORAGE_KEY = 'synapse-storm:custom-storm';

function loadPicked(): PuzzleCategory[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (Array.isArray(parsed)) {
      const valid = parsed.filter((c): c is PuzzleCategory => CUSTOM_STORM_CATEGORIES.includes(c));
      if (valid.length) return valid;
    }
  } catch {
    /* storage unavailable: start from the default */
  }
  return ['math', 'pattern'];
}

interface CustomStormPickerProps {
  onStart: (categories: PuzzleCategory[]) => void;
}

/** R14: pick which micro-challenges appear. The run is unranked and never submits a score. */
export const CustomStormPicker: React.FC<CustomStormPickerProps> = ({ onStart }) => {
  const { t } = useTranslation('f-async-games');
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<PuzzleCategory[]>(loadPicked);

  const labels: Record<PuzzleCategory, string> = {
    math: t('storm-cat-math', { defaultValue: 'Math' }),
    pattern: t('storm-cat-pattern', { defaultValue: 'Pattern' }),
    language: t('storm-cat-language', { defaultValue: 'Language' }),
    spatial: t('storm-cat-spatial', { defaultValue: 'Spatial' }),
    memory: t('storm-cat-memory', { defaultValue: 'Memory' }),
    reaction: t('storm-cat-reaction', { defaultValue: 'Reaction' }),
    minigame: t('storm-cat-minigame', { defaultValue: 'Mini-games' }),
    fling: t('storm-cat-fling', { defaultValue: 'Fling' }),
    powerup: t('storm-cat-powerup', { defaultValue: 'Power-ups' }),
    meta: t('storm-cat-meta', { defaultValue: 'Meta' }),
  };

  const toggle = (c: PuzzleCategory) =>
    setPicked((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));
  // Power-ups alone would leave a storm with nothing to solve.
  const canStart = picked.some((c) => c !== 'powerup');

  const start = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(picked));
    } catch {
      /* remembering the pick is a convenience only */
    }
    onStart(CUSTOM_STORM_CATEGORIES.filter((c) => picked.includes(c)));
  };

  return (
    <>
      <button
        className="start-button multiplayer-button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {t('storm-custom-open', { defaultValue: 'CUSTOM STORM (TRAINING)' })}
        <div className="start-glow" />
      </button>
      {open && (
        <div className="settings-panel">
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="hud-label">
              {t('storm-custom-legend', { defaultValue: 'Challenges in your storm' })}
            </legend>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', margin: '8px 0' }}>
              {CUSTOM_STORM_CATEGORIES.map((c) => (
                <label
                  key={c}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 32 }}
                >
                  <input type="checkbox" checked={picked.includes(c)} onChange={() => toggle(c)} />
                  {labels[c]}
                </label>
              ))}
            </div>
          </fieldset>
          <p className="menu-tagline" style={{ fontSize: '0.8rem' }}>
            {t('storm-custom-note', {
              defaultValue: 'Training mode: unranked, and your score is never submitted.',
            })}
          </p>
          <button className="start-button" onClick={start} disabled={!canStart}>
            {t('storm-custom-start', { defaultValue: 'START TRAINING STORM' })}
            <div className="start-glow" />
          </button>
        </div>
      )}
    </>
  );
};

/** Shown on the game-over screen of a training storm in place of the leaderboard. */
export const TrainingNote: React.FC = () => {
  const { t } = useTranslation('f-async-games');
  return (
    <p className="menu-tagline">
      {t('storm-training-over', {
        defaultValue: 'Training storm: unranked, so this score was not submitted.',
      })}
    </p>
  );
};
