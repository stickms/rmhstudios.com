import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { SettingsSelectRow } from '@/components/settings/SettingsSelectRow';
import { ThemeGallery } from '@/components/settings/ThemeGallery';
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
import { SettingsSection } from '@/components/settings/SettingsSection';
import {
  setAppearancePrefsApi,
  type AppearancePrefsInput,
} from '@/lib/preferences/preferences.contract';
import { api } from '@/lib/contract/client';
import {
  DATA_SAVER_PREFERENCES,
  useDataSaverPreference,
  type DataSaverPreference,
} from '@/hooks/useDataSaver';

async function persist(body: AppearancePrefsInput) {
  await api(setAppearancePrefsApi, { body }).catch(() => {});
}


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

  const fontLabels: Record<FontScale, string> = {
    875: t('text-size-small', { defaultValue: 'Small' }),
    1000: t('text-size-default', { defaultValue: 'Default' }),
    1125: t('text-size-large', { defaultValue: 'Large' }),
    1250: t('text-size-larger', { defaultValue: 'Larger' }),
  };

  return (
    <>
      <Section
        title={t('display', { defaultValue: 'Display' })}
        description={t('display-desc', { defaultValue: 'How the page reads on this device.' })}
      >
        <ThemeGallery />
        <SettingsSelectRow
          label={t('text-size', { defaultValue: 'Text size' })}
          hint={t('text-size-desc', { defaultValue: 'Scale the whole interface.' })}
          value={String(activeFontScale)}
          onChange={(v) => setFontScale(Number(v) as FontScale)}
          options={FONT_SCALES.map((scale) => ({ value: String(scale), label: fontLabels[scale] }))}
        />
        <SettingsSelectRow
          label={t('density', { defaultValue: 'Density' })}
          hint={t('density-desc', { defaultValue: 'Compact tightens spacing.' })}
          value={activeDensity}
          onChange={(v) => setDensity(v as 'cozy' | 'compact')}
          options={[
            { value: 'cozy', label: t('density-option-cozy', { defaultValue: 'Cozy' }) },
            { value: 'compact', label: t('density-option-compact', { defaultValue: 'Compact' }) },
          ]}
        />
        <SettingsSelectRow
          label={t('color-vision', { defaultValue: 'Colour vision' })}
          hint={t(`color-vision-${store.colorVision}-hint`, {
            defaultValue: COLOR_VISION_HINTS[store.colorVision],
          })}
          value={store.colorVision}
          onChange={(v) => setColorVision(v as ColorVisionMode)}
          options={COLOR_VISION_MODES.map((mode) => ({
            value: mode,
            label: t(`color-vision-${mode}`, { defaultValue: COLOR_VISION_LABELS[mode] }),
          }))}
        />
        <ToggleRow
          label={t('readable-font', { defaultValue: 'Readable font' })}
          description={t('readable-font-desc', {
            defaultValue: 'A more legible body font with looser spacing.',
          })}
          checked={store.readableFont}
          onChange={setReadableFont}
        />
      </Section>

      <Section
        title={t('custom-accent', { defaultValue: 'Custom accent' })}
        description={t('custom-accent-desc', {
          defaultValue: 'Pick any color — it is auto-adjusted to stay readable.',
        })}
      >
        <div className="settings-row flex-wrap">
          <span className="settings-row__hint">
            {store.customAccent
              ? t('custom-accent-on', { defaultValue: 'Using your colour.' })
              : t('custom-accent-none', {
                  defaultValue: 'No custom accent — using the theme’s own color.',
                })}
          </span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={HEX_RE.test(hexDraft) ? hexDraft : '#0b0b0b'}
              onChange={(e) => applyCustomAccent(e.target.value)}
              aria-label={t('custom-accent', { defaultValue: 'Custom accent' })}
              className="h-9 w-12 cursor-pointer rounded-site-sm border border-site-border bg-transparent pointer-coarse:h-11"
            />
            <Input
              value={hexDraft}
              onChange={(e) => setHexDraft(e.target.value)}
              onBlur={() => applyCustomAccent(hexDraft)}
              spellCheck={false}
              autoCapitalize="off"
              className="w-28 font-mono"
              aria-label={t('accent-hex', { defaultValue: 'Accent hex' })}
            />
            {store.customAccent ? (
              <Button type="button" variant="ghost" onClick={clearCustomAccent}>
                {t('clear', { defaultValue: 'Reset to theme' })}
              </Button>
            ) : null}
          </div>
        </div>
      </Section>

      <Section title={t('motion', { defaultValue: 'Motion' })}>
        <SettingsSelectRow
          label={t('globe-motion', { defaultValue: 'Globe motion' })}
          hint={t('globe-motion-desc', {
            defaultValue:
              'The globe drifts slowly when idle. Still stops the drift. Dragging it always works.',
          })}
          value={store.jellyMotion}
          onChange={(v) => {
            if (isJellyMotion(v)) setJellyMotion(v);
          }}
          options={JELLY_MOTION_LEVELS.map((id) => ({ value: id, label: globeMotionLabels[id] }))}
        />
        {/* Tilt effects (§5.5x C.3): only renders where iOS gates device orientation behind a prompt. */}
        <TiltEffectsRow />
      </Section>

      <DataSaverSection />
    </>
  );
}

/**
 * Data saver (plan B20). Stored per device in localStorage (`rmh-data-saver`), not
 * on the account: a phone on a metered plan and a desktop on broadband are the
 * same account. `Auto` follows the browser's Save-Data flag and the measured
 * connection (lib/network-quality); the link prefetchers and the image
 * components read the same setting.
 */
function DataSaverSection() {
  const { t } = useTranslation('settings-appearance');
  const [preference, setPreference] = useDataSaverPreference();
  const labels: Record<DataSaverPreference, string> = {
    auto: t('data-saver-auto', { defaultValue: 'Auto' }),
    on: t('data-saver-on', { defaultValue: 'On' }),
    off: t('data-saver-off', { defaultValue: 'Off' }),
  };
  return (
    <Section title={t('data', { defaultValue: 'Data' })}>
      <SettingsSelectRow
        label={t('data-saver', { defaultValue: 'Data saver' })}
        hint={t('data-saver-desc', {
          defaultValue: 'Load smaller images and skip preloading pages. Auto follows your browser and connection.',
        })}
        value={preference}
        onChange={(v) => {
          if ((DATA_SAVER_PREFERENCES as readonly string[]).includes(v)) {
            setPreference(v as DataSaverPreference);
          }
        }}
        options={DATA_SAVER_PREFERENCES.map((id) => ({ value: id, label: labels[id] }))}
      />
    </Section>
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
