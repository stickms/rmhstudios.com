'use client';

/**
 * Accent-color picker: recolor the highlight (`--site-accent`) on top of whatever
 * theme is active, or fall back to the theme's own accent. Curated swatches only,
 * so every choice keeps readable contrast (see lib/appearance.ts). Selecting one
 * applies instantly and — for signed-in users — syncs to the account (handled in
 * Providers).
 */

import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { ACCENT_PRESETS } from '@/lib/appearance';
import { useThemeStore } from '@/stores/themeStore';
import { cn } from '@/lib/utils';

export function AccentPicker() {
  const { t } = useTranslation('feed');
  const accent = useThemeStore((s) => s.accent);
  const setAccent = useThemeStore((s) => s.setAccent);

  return (
    <div
      role="radiogroup"
      aria-label={t('settings-accent-aria', { defaultValue: 'Accent color' })}
      className="flex flex-wrap gap-2.5"
    >
      {/* Theme default — clears any accent override. */}
      <button
        type="button"
        role="radio"
        aria-checked={accent === null}
        onClick={() => setAccent(null)}
        title={t('settings-accent-default', { defaultValue: 'Theme default' })}
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-full border-2 bg-site-surface transition-all',
          accent === null
            ? 'border-site-accent ring-2 ring-site-accent'
            : 'border-site-border hover:border-site-text/40'
        )}
      >
        {/* A dot in the live theme accent hints "use the theme's own color". */}
        <span aria-hidden className="h-4 w-4 rounded-full bg-site-accent" />
        <span className="sr-only">{t('settings-accent-default', { defaultValue: 'Theme default' })}</span>
      </button>

      {ACCENT_PRESETS.map((preset) => {
        const active = accent === preset.id;
        return (
          <button
            key={preset.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setAccent(preset.id)}
            title={preset.label}
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all',
              active ? 'border-site-text ring-2 ring-site-text/40' : 'border-site-border hover:scale-110'
            )}
            style={{ background: preset.value }}
          >
            {active && <Check className="h-4 w-4" aria-hidden style={{ color: preset.fg }} />}
            <span className="sr-only">{preset.label}</span>
          </button>
        );
      })}
    </div>
  );
}
