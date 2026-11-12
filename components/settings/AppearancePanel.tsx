import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { Check } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useThemeStore } from '@/stores/themeStore';
import {
  FONT_SCALES,
  HEX_RE,
  COLOR_VISION_MODES,
  COLOR_VISION_LABELS,
  COLOR_VISION_HINTS,
  type FontScale,
  type ColorVisionMode,
  JELLY_MOTION_LEVELS,
  isJellyMotion,
  type JellyMotion,
} from '@/lib/appearance/prefs';
import { ensureReadableAccent } from '@/lib/appearance/contrast';
import { TiltEffectsRow } from '@/components/settings/TiltEffectsRow';
import { Tabs } from '@/components/ui/tabs';
import { SettingsSection } from '@/components/settings/SettingsSection';
import {
  setAppearancePrefsApi,
  type AppearancePrefsInput,
} from '@/lib/preferences/preferences.contract';
import { api } from '@/lib/contract/client';

async function persist(body: AppearancePrefsInput) {
  await api(setAppearancePrefsApi, { body }).catch(() => {});
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
  function setColorVision(value: ColorVisionMode) {
    store.setColorVision(value);
    void persist({ colorVision: value });
  }
  function setJellyMotion(value: JellyMotion) {
    store.setJellyMotion(value);
    void persist({ jellyMotion: value });
  }

  const globeMotionLabels: Record<JellyMotion, string> = {
    lively: t('globe-motion-on', { defaultValue: 'On' }),
    still: t('globe-motion-still', { defaultValue: 'Still' }),
  };

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
    <>
      {/* Text size */}
      <Section
        title={t('text-size', { defaultValue: 'Text size' })}
        description={t('text-size-desc', { defaultValue: 'Scale the whole interface.' })}
      >
        <Tabs
          aria-label={t('text-size', { defaultValue: 'Text size' })}
          tabs={FONT_SCALES.map((scale) => ({ id: String(scale), label: FONT_LABELS[scale] }))}
          value={String(activeFontScale)}
          onChange={(id) => setFontScale(Number(id) as FontScale)}
        />
      </Section>

      {/* Density */}
      <Section
        title={t('density', { defaultValue: 'Density' })}
        description={t('density-desc', { defaultValue: 'Compact tightens spacing.' })}
      >
        <Tabs
          aria-label={t('density', { defaultValue: 'Density' })}
          tabs={(['cozy', 'compact'] as const).map((d) => ({
            id: d,
            label: t(`density-${d}`, { defaultValue: d }),
          }))}
          value={activeDensity}
          onChange={(id) => setDensity(id as 'cozy' | 'compact')}
        />
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
          <p className="text-xs text-site-text-muted">
            {t('custom-accent-none', {
              defaultValue: 'No custom accent — using the theme’s own color.',
            })}
          </p>
        ) : null}
      </Section>

      {/* Colour vision */}
      <Section
        title={t('color-vision', { defaultValue: 'Colour vision' })}
        description={t('color-vision-desc', {
          defaultValue:
            'Retint success, warning and danger colours so they stay distinguishable. Status labels also carry their own icon, so nothing depends on colour alone.',
        })}
      >
        <div role="radiogroup" aria-label={t('color-vision', { defaultValue: 'Colour vision' })}>
          {COLOR_VISION_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={store.colorVision === mode}
              onClick={() => setColorVision(mode)}
              className="settings-row settings-choice"
            >
              <span className="settings-row__text">
                <span className="settings-row__name block">
                  {t(`color-vision-${mode}`, { defaultValue: COLOR_VISION_LABELS[mode] })}
                </span>
                <span className="settings-row__hint block">
                  {t(`color-vision-${mode}-hint`, { defaultValue: COLOR_VISION_HINTS[mode] })}
                </span>
              </span>
              {store.colorVision === mode ? (
                <Check className="settings-choice__mark" aria-hidden />
              ) : null}
            </button>
          ))}
        </div>

        {/* A live swatch row: the three semantic colours as they will actually
            render, so the choice can be judged instead of guessed. */}
        <div className="flex flex-wrap gap-4" aria-hidden>
          <span className="text-xs font-semibold text-site-success">
            ✓ {t('color-vision-sample-success', { defaultValue: 'Success' })}
          </span>
          <span className="text-xs font-semibold text-site-warning">
            ⚠ {t('color-vision-sample-warning', { defaultValue: 'Warning' })}
          </span>
          <span className="text-xs font-semibold text-site-danger">
            ✕ {t('color-vision-sample-danger', { defaultValue: 'Danger' })}
          </span>
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
        {/* Tilt effects (§5.5x C.3): only renders on platforms that gate device
            orientation behind a permission prompt (iOS). Self-contained consent. */}
        <TiltEffectsRow />
      </Section>

      <Section
        title={t('globe-motion', { defaultValue: 'Globe motion' })}
        description={t('globe-motion-desc', {
          defaultValue:
            'The globe drifts slowly when idle. Still stops the drift. Dragging it always works.',
        })}
      >
        <Tabs
          aria-label={t('globe-motion', { defaultValue: 'Globe motion' })}
          tabs={JELLY_MOTION_LEVELS.map((id) => ({ id, label: globeMotionLabels[id] }))}
          value={store.jellyMotion}
          onChange={(id) => {
            if (isJellyMotion(id)) setJellyMotion(id);
          }}
        />
      </Section>

      {/* The theme gallery lives on the settings index, so the page named
          "Appearance" contained no way to change the theme. Point at it. */}
      <Section
        title={t('theme', { defaultValue: 'Theme' })}
        description={t('theme-desc-two-themes', {
          defaultValue: 'Midnight (the default) and Daylight.',
        })}
      >
        <Button asChild variant="default">
          <Link to="/settings" hash="appearance">
            {t('browse-themes', { defaultValue: 'Browse themes' })}
          </Link>
        </Button>
      </Section>
    </>
  );
}

/**
 * One settings section — delegates to the shared settings grammar
 * (`SettingsSection`) so Appearance matches every other settings page.
 */
export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <SettingsSection title={title} description={description}>
      {children}
    </SettingsSection>
  );
}

export function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="chrome-row settings-row">
      <span className="settings-row__text">
        <span className="settings-row__name block">{label}</span>
        {description ? <span className="settings-row__hint block">{description}</span> : null}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </label>
  );
}
