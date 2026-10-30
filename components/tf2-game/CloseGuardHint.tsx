/**
 * A one-time hint for browsers that cannot hand Ctrl+W to a game (Firefox and
 * Safari have no Keyboard Lock API, and reserve the close-tab shortcut even in
 * fullscreen). With crouch on Ctrl, Ctrl+W while moving forward would close the
 * tab: `useCloseGuard` makes the browser ask first, and this offers to move
 * crouch to a free key instead. Dismissal is remembered in localStorage.
 */
'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Keybinds } from '@/lib/tf2-game/client/input/actions';
import type { GameSettings } from '@/lib/tf2-game/client/settings';

const DISMISS_KEY = 'rmh-tf2-ctrlw-hint';
const CTRL_KEYS = new Set(['ControlLeft', 'ControlRight']);
/** Crouch candidates, first unbound one wins (HL2 uses Shift for sprint). */
const CANDIDATES = ['ShiftLeft', 'KeyC', 'AltLeft'] as const;
const KEY_LABEL: Record<(typeof CANDIDATES)[number], string> = {
  ShiftLeft: 'Shift',
  KeyC: 'C',
  AltLeft: 'Alt',
};

function canLockKeyboard(): boolean {
  return typeof navigator !== 'undefined' && !!(navigator as Navigator & { keyboard?: { lock?: unknown } }).keyboard?.lock;
}

function dismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function freeKey(binds: Keybinds): (typeof CANDIDATES)[number] | null {
  const used = new Set(Object.values(binds).flat());
  return CANDIDATES.find((k) => !used.has(k)) ?? null;
}

export default function CloseGuardHint({
  settings,
  onSettingsChange,
}: {
  settings: GameSettings;
  onSettingsChange: (next: GameSettings) => void;
}) {
  const { t } = useTranslation('c-tf2-game');
  const [hidden, setHidden] = useState(() => canLockKeyboard() || dismissed());
  const crouchOnCtrl = (settings.keybinds.duck ?? []).some((k) => CTRL_KEYS.has(k));
  if (hidden || !crouchOnCtrl) return null;

  const close = () => {
    setHidden(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Storage blocked: the hint simply comes back next time.
    }
  };
  const key = freeKey(settings.keybinds);
  const rebind = () => {
    if (!key) return;
    const duck = [...(settings.keybinds.duck ?? []).filter((k) => !CTRL_KEYS.has(k)), key];
    onSettingsChange({ ...settings, keybinds: { ...settings.keybinds, duck } });
    close();
  };

  return (
    <div className="tf2g-play-hint" role="status">
      <p>
        {t('closeguard_hint', {
          defaultValue:
            'This browser does not let games use Ctrl+W, so crouching (Ctrl) while moving forward (W) would close the tab. It will ask before closing, or you can move crouch to another key.',
        })}
      </p>
      <div className="tf2g-play-hint-actions">
        {key ? (
          <button type="button" className="tf2g-play-button" onClick={rebind}>
            {t('closeguard_rebind', { defaultValue: 'Crouch on {{key}}', key: KEY_LABEL[key] })}
          </button>
        ) : null}
        <button type="button" className="tf2g-play-button tf2g-play-button-quiet" onClick={close}>
          {t('closeguard_keep', { defaultValue: 'Keep Ctrl' })}
        </button>
      </div>
    </div>
  );
}
