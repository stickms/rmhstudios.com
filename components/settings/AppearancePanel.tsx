'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useThemeStore } from '@/stores/themeStore';
import { FONT_SCALES, HEX_RE, type FontScale } from '@/lib/appearance/prefs';
import { ensureReadableAccent } from '@/lib/appearance/contrast';
import { TiltEffectsRow } from '@/components/settings/TiltEffectsRow';

async function persist(body: Record<string, unknown>) {
  await fetch('/api/preferences/appearance', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  }).catch(() => {});
}

const FONT_LABELS: Record<FontScale, string> = {
  875: 'A−',
  1000: 'A',
  1125: 'A+',
  1250: 'A++',
};

/**
 * AppearancePanel (§13) — the comfort + accessibility controls. Each knob
 * applies instantly through the theme store (which paints it and caches it to
 * localStorage for no-flash) and persists to the account. Comfort settings are
 * never paywalled.
 */
export function AppearancePanel() {
  const { t } = useTranslation('settings-appearance');
  const store = useThemeStore();
  const [hexDraft, setHexDraft] = useState(store.customAccent ?? '#0b0b0b');

  function setFontScale(value: FontScale) {
    store.setFontScale(value === 1000 ? null : value);
    void persist({ fontScale: value });
  }
  function setDensity(value: 'cozy' | 'compact') {
    store.setDensity(value === 'cozy' ? null : value);
    void persist({ density: value });
  }
  function setReadableFont(value: boolean) {
    store.setReadableFont(value);
    void persist({ readableFont: value });
  }
  function setReduceMotion(value: boolean) {
    store.setReduceMotion(value);
    void persist({ reduceMotion: value });
  }
  function applyCustomAccent(hex: string) {
    if (!HEX_RE.test(hex)) return;
    const { hex: adjusted, adjusted: wasAdjusted } = ensureReadableAccent(hex);
    store.setCustomAccent(adjusted);
    setHexDraft(adjusted);
    void persist({ customAccent: adjusted });
    if (wasAdjusted) {
      toast.info(t('accent-adjusted', { defaultValue: 'Adjusted the color for readability' }));
    }
  }
  function clearCustomAccent() {
    store.setCustomAccent(null);
    void persist({ customAccent: null });
  }

  const activeFontScale = (store.fontScale ?? 1000) as FontScale;
  const activeDensity = store.density ?? 'cozy';

  return (
    <div className="space-y-8">
      {/* Text size */}
      <Section
        title={t('text-size', { defaultValue: 'Text size' })}
        description={t('text-size-desc', { defaultValue: 'Scale the whole interface.' })}
      >
        <div className="flex gap-2">
          {FONT_SCALES.map((scale) => (
            <button
              key={scale}
              type="button"
              onClick={() => setFontScale(scale)}
              aria-pressed={activeFontScale === scale}
              className={cn(
                'flex-1 rounded-site-sm py-2 text-center transition-colors',
                activeFontScale === scale
                  ? 'bg-site-accent text-site-accent-fg'
                  : 'border border-site-border bg-site-surface text-site-text hover:border-site-text/40',
              )}
            >
              {FONT_LABELS[scale]}
            </button>
          ))}
        </div>
      </Section>

      {/* Density */}
      <Section
        title={t('density', { defaultValue: 'Density' })}
        description={t('density-desc', { defaultValue: 'Compact tightens spacing.' })}
      >
        <div className="flex gap-2">
          {(['cozy', 'compact'] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDensity(d)}
              aria-pressed={activeDensity === d}
              className={cn(
                'flex-1 rounded-site-sm py-2 text-center capitalize transition-colors',
                activeDensity === d
                  ? 'bg-site-accent text-site-accent-fg'
                  : 'border border-site-border bg-site-surface text-site-text hover:border-site-text/40',
              )}
            >
              {t(`density-${d}`, { defaultValue: d })}
            </button>
          ))}
        </div>
      </Section>

      {/* Custom accent */}
      <Section
        title={t('custom-accent', { defaultValue: 'Custom accent' })}
        description={t('custom-accent-desc', {
          defaultValue: 'Pick any color — it is auto-adjusted to stay readable.',
        })}
      >
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="color"
            value={HEX_RE.test(hexDraft) ? hexDraft : '#0b0b0b'}
            onChange={(e) => applyCustomAccent(e.target.value)}
            aria-label={t('custom-accent', { defaultValue: 'Custom accent' })}
            className="h-11 w-14 cursor-pointer rounded-site-sm border border-site-border bg-transparent"
          />
          <Input
            value={hexDraft}
            onChange={(e) => setHexDraft(e.target.value)}
            onBlur={() => applyCustomAccent(hexDraft)}
            spellCheck={false}
            autoCapitalize="off"
            className="w-32 font-mono"
            aria-label={t('accent-hex', { defaultValue: 'Accent hex' })}
          />
          {store.customAccent ? (
            <Button type="button" variant="ghost" onClick={clearCustomAccent}>
              {t('clear', { defaultValue: 'Reset to theme' })}
            </Button>
          ) : null}
        </div>
        {/* The field always shows *a* hex, including the placeholder it starts
            with, so "no custom accent" looked identical to "custom accent set
            to #0b0b0b" — and on graphite everything on screen was rendering
            the theme's blue while this said near-black. Say which it is. */}
        {!store.customAccent ? (
          <p className="mt-2 text-xs text-site-text-muted">
            {t('custom-accent-none', {
              defaultValue: 'No custom accent — using the theme’s own color.',
            })}
          </p>
        ) : null}
      </Section>

      {/* Comfort toggles */}
      <Section title={t('comfort', { defaultValue: 'Comfort' })}>
        <ToggleRow
          label={t('readable-font', { defaultValue: 'Readable font' })}
          description={t('readable-font-desc', {
            defaultValue: 'A more legible body font with looser spacing.',
          })}
          checked={store.readableFont}
          onChange={setReadableFont}
        />
        <ToggleRow
          label={t('reduce-motion', { defaultValue: 'Reduce motion' })}
          description={t('reduce-motion-desc', {
            defaultValue: 'Minimize animations and transitions.',
          })}
          checked={store.reduceMotion}
          onChange={setReduceMotion}
        />
        {/* Tilt effects (§5.5x C.3): only renders on platforms that gate device
            orientation behind a permission prompt (iOS). Self-contained consent. */}
        <TiltEffectsRow />
      </Section>

      {/* The theme gallery lives on the settings index, so the page named
          "Appearance" contained no way to change the theme. Point at it. */}
      <Section
        title={t('theme', { defaultValue: 'Theme' })}
        description={t('theme-desc', {
          defaultValue: 'Daylight, Midnight, High Contrast and the curated themes.',
        })}
      >
        <Button asChild variant="outline">
          <Link to="/settings" hash="appearance">
            {t('browse-themes', { defaultValue: 'Browse themes' })}
          </Link>
        </Button>
      </Section>
    </div>
  );
}

/**
 * One settings section.
 *
 * `glass-pane` because this page had dropped the settings hub's card system:
 * its sections sat bare on the aurora with no container edge, and `max-w-xl`
 * because without one the ToggleRows were `justify-between` across the full
 * column — at 1920px a switch ended up ~880px from the label it belongs to,
 * with nothing tying the two together. Same reason the segmented buttons were
 * stretching to ~445px each.
 */
function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="glass-pane rounded-site p-5">
      <h3 className="text-sm font-semibold text-site-text">{title}</h3>
      {description ? (
        <p className="mb-3 text-sm text-site-text-muted">{description}</p>
      ) : (
        <div className="mb-3" />
      )}
      <div className="max-w-xl">{children}</div>
    </section>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 py-2.5">
      <span className="min-w-0">
        <span className="block text-sm text-site-text">{label}</span>
        {description ? (
          <span className="block text-xs text-site-text-muted">{description}</span>
        ) : null}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
