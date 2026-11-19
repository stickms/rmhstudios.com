import { useTranslation } from 'react-i18next';

import { Switch } from '@/components/ui/switch';
import { SettingsSelectRow } from '@/components/settings/SettingsSelectRow';
import { ThemePicker } from '@/components/settings/ThemePicker';
import type { UserThemeView } from '@/lib/themes/tokens';
import { useThemeStore } from '@/stores/themeStore';
import {
  COLOR_VISION_MODES,
  COLOR_VISION_LABELS,
  COLOR_VISION_HINTS,
  type ColorVisionMode,
  JELLY_MOTION_LEVELS,
  isJellyMotion,
  type JellyMotion,
} from '@/lib/appearance/prefs';
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
export function AppearancePanel({ ownedThemes = [] }: { ownedThemes?: UserThemeView[] }) {
  const { t } = useTranslation('settings-appearance');
  const store = useThemeStore();

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



  return (
    <>
      <Section
        title={t('display', { defaultValue: 'Display' })}
        description={t('display-desc', { defaultValue: 'How the page reads on this device.' })}
      >
        <ThemePicker owned={ownedThemes} />
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
          description={t('readable-font-hint', {
            defaultValue: 'A plainer, more legible font for running text.',
          })}
          checked={store.readableFont}
          onChange={setReadableFont}
        />
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
