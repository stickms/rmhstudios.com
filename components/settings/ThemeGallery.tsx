/**
 * The theme picker (Steel section 10, Settings): the two editions as a radio list of rows on rules, the way every
 * other choice on the page is set (`.settings-choice`). No swatch cards. Each row names the edition and says in one
 * line what it is; the chosen row is ink at 600 with a check at the end, so state is never colour alone (A2).
 *
 * Hovering or focusing a row previews the edition on the whole page, and leaving the list reverts it to the saved one.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { SITE_STYLES, useThemeStore, type SiteStyle } from '@/stores/themeStore';

export function ThemeGallery() {
  const { t } = useTranslation('feed');
  const style = useThemeStore((s) => s.style);
  const setStyle = useThemeStore((s) => s.setStyle);
  const setPreview = useThemeStore((s) => s.setPreview);

  // §17.3 no-freeze: each preview applies the theme site-wide by swapping the root
  // `.style-*` class — a full-document style recalc across every backdrop surface
  // (~20–40ms each, traced). Sweeping the pointer across the grid used to fire one
  // per swatch crossed, stacking into the reported freeze. Debounce so a fast sweep
  // collapses to the swatch actually settled on; the previous swatch's hover-out and
  // a real click both apply immediately (clearing the pending debounce), so the
  // preview still feels instant.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearPending = () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  };
  const previewSoon = useCallback(
    (id: SiteStyle) => {
      clearPending();
      debounceRef.current = setTimeout(() => setPreview(id), 45);
    },
    [setPreview],
  );
  const previewNow = useCallback(
    (id: SiteStyle | null) => {
      clearPending();
      setPreview(id);
    },
    [setPreview],
  );
  useEffect(() => clearPending, []);

  return (
    <div
      role="radiogroup"
      aria-label={t('settings-edition-aria', { defaultValue: 'Edition' })}
      onMouseLeave={() => previewNow(null)}
    >
      {SITE_STYLES.map((s) => {
        const active = style === s.id;
        return (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => {
              clearPending();
              setStyle(s.id);
            }}
            onMouseEnter={() => previewSoon(s.id)}
            onFocus={() => previewNow(s.id)}
            onBlur={() => previewNow(null)}
            className="settings-row settings-choice"
          >
            <span className="settings-row__text">
              <span className="settings-row__name block">{s.label}</span>
              <span className="settings-row__hint block">
                {s.id === 'graphite'
                  ? t('settings-edition-night-hint', {
                      defaultValue: 'A near-black page with white ink.',
                    })
                  : t('settings-edition-day-hint', {
                      defaultValue: 'A light page with black ink.',
                    })}
              </span>
            </span>
            {active && <Check className="settings-choice__mark" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}
