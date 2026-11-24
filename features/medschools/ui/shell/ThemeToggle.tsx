import { Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMedMode } from './useMedMode';

/**
 * The top bar's light / dark switch. A toggle button (`aria-pressed` = dark is on), not a tab strip. The pressed state is
 * unknown on the server and on the hydrating render (the mode lives in this device's storage), so until the app's root
 * has mounted the button is the same size with no pressed state and does nothing.
 */
export function ThemeToggle() {
  const { t } = useTranslation('medschools');
  const { mode, toggle } = useMedMode();
  const dark = mode === 'dark';
  return (
    <button
      type="button"
      className="medapp-round"
      aria-label={t('shell-theme-label', { defaultValue: 'Dark mode' })}
      aria-pressed={mode === null ? undefined : dark}
      onClick={mode === null ? undefined : toggle}
    >
      {dark ? <Sun aria-hidden size={18} /> : <Moon aria-hidden size={18} />}
    </button>
  );
}
