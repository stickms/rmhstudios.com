/**
 * Visual theme picker: one live preview card per site theme, grouped the same
 * way as the theme catalog. Each card's swatch area is wrapped in that theme's
 * `.style-*` class so the preview renders with the theme's real tokens — no
 * hardcoded palette copies to drift out of sync.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { SITE_STYLES, useThemeStore, type SiteStyle } from '@/stores/themeStore';
import { cn } from '@/lib/utils';

const GROUPS = [...new Set(SITE_STYLES.map((s) => s.group))];

function ThemePreviewSwatch({ styleId }: { styleId: string }) {
  return (
    <div
      aria-hidden
      // §17.3: contain each swatch so its scoped `.style-*` cascade can't participate
      // in the full-document recalc when the ROOT theme (preview) swaps.
      className={cn(
        `style-${styleId}`,
        'pointer-events-none border-b border-site-border [contain:layout_paint]',
      )}
    >
      <div className="p-2.5" style={{ background: 'var(--site-bg)' }}>
        <div
          className="border p-2"
          style={{
            background: 'var(--site-surface)',
            borderColor: 'var(--site-border)',
            borderRadius: 'var(--site-radius-sm)',
          }}
        >
          <div className="h-1.5 w-3/5 rounded-full" style={{ background: 'var(--site-text)' }} />
          <div
            className="mt-1 h-1.5 w-4/5 rounded-full"
            style={{ background: 'var(--site-text-muted)' }}
          />
          <div
            className="mt-2 h-3.5 w-9 rounded-full"
            style={{ background: 'var(--site-accent)' }}
          />
        </div>
      </div>
    </div>
  );
}

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
    <div className="space-y-5">
      {GROUPS.map((group) => (
        <div key={group}>
          <h3 className="t-label mb-2">
            {t(`settings-theme-group-${group.toLowerCase()}`, { defaultValue: group })}
          </h3>
          {/* Leaving a group's grid reverts any hover preview to the committed
              theme (clearing on the radiogroup rather than each swatch avoids a
              flicker as the pointer crosses between adjacent swatches). */}
          <div
            role="radiogroup"
            aria-label={t('settings-theme-group-aria', {
              defaultValue: '{{group}} themes',
              group,
            })}
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
            onMouseLeave={() => previewNow(null)}
          >
            {SITE_STYLES.filter((s) => s.group === group).map((s) => {
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
                  className={cn(
                    'overflow-hidden rounded-site border text-left transition-colors',
                    active
                      ? 'border-site-accent ring-2 ring-site-accent'
                      : 'border-site-border hover:border-site-text/40',
                  )}
                >
                  <ThemePreviewSwatch styleId={s.id} />
                  <div className="flex items-center gap-1.5 px-2.5 py-2">
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate text-xs text-site-text',
                        active ? 'font-semibold' : 'font-medium',
                      )}
                    >
                      {s.label}
                    </span>
                    {active && (
                      <Check className="h-3.5 w-3.5 shrink-0 text-site-accent" aria-hidden />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
