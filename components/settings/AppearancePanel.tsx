'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useThemeStore } from '@/stores/themeStore';
import { FONT_SCALES, HEX_RE, type FontScale } from '@/lib/appearance/prefs';
import { ensureReadableAccent } from '@/lib/appearance/contrast';
import { GlassClarityControl } from '@/components/settings/GlassClarityControl';

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
  const [hexDraft, setHexDraft] = useState(store.customAccent ?? '#8b5cf6');

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
                  : 'glass-fill text-site-text hover:border-site-border-bright',
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
                  : 'glass-fill text-site-text hover:border-site-border-bright',
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
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={HEX_RE.test(hexDraft) ? hexDraft : '#8b5cf6'}
            onChange={(e) => applyCustomAccent(e.target.value)}
            aria-label={t('custom-accent', { defaultValue: 'Custom accent' })}
            className="h-10 w-14 cursor-pointer rounded-site-sm border border-site-border bg-transparent"
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
            <Button type="button" variant="ghost" size="sm" onClick={clearCustomAccent}>
              {t('clear', { defaultValue: 'Clear' })}
            </Button>
          ) : null}
        </div>
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
      </Section>

      {/* Glass clarity (§5.46) — the frosted↔clear slider (stop 0 Opaque is the
          old reduce-transparency behavior). Self-contained: applies + persists. */}
      <Section title={t('glass-section', { defaultValue: 'Glass' })}>
        <GlassClarityControl />
      </Section>
    </div>
  );
}

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
    <section>
      <h3 className="text-sm font-semibold text-site-text">{title}</h3>
      {description ? <p className="mb-3 text-sm text-site-text-muted">{description}</p> : <div className="mb-3" />}
      {children}
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
        {description ? <span className="block text-xs text-site-text-muted">{description}</span> : null}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
