import { createFileRoute } from '@tanstack/react-router';
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocaleStore } from '@/stores/localeStore';
import { LOCALES, LOCALE_LABELS, type Locale } from '@/lib/i18n/config';
import { CanvasPage } from '@/canvas-ui/runtime/CanvasPage';
import { Box } from '@/canvas-ui/runtime/layout/LayoutTree';
import { tw } from '@/canvas-ui/runtime/tw';
import { CanvasText } from '@/canvas-ui/text/Text';
import { ScrollView } from '@/canvas-ui/widgets/ScrollView';
import { Icon } from '@/canvas-ui/widgets/Icon';
import { icons } from '@/canvas-ui/widgets/icons';
import { Select, type SelectOption } from '@/canvas-ui/widgets/Select';
import { DoctrineShell, DOCTRINE } from '@/components/doctrine/canvas/DoctrineShell';

export const Route = createFileRoute('/strategies/profile/settings')({
  component: SettingsPage,
});

const TIMEZONES: string[] =
  typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : ['UTC'];

interface SettingsSceneProps extends Record<string, unknown> {
  title: string; languageLabel: string; timezoneLabel: string; sahurNote: string;
  tierTitle: string; tierBody: string;
  locale: string; localeOptions: SelectOption[]; onLocaleChange: (v: string) => void;
  timezone: string; timezoneOptions: SelectOption[]; onTimezoneChange: (v: string) => void;
}

function FieldLabel({ children }: { children: string }) {
  return <CanvasText style="text-xs font-mono uppercase tracking-wide text-[rgba(255,255,255,0.4)]">{children}</CanvasText>;
}

function SettingsScene(p: SettingsSceneProps) {
  return (
    <DoctrineShell>
      <ScrollView style={tw('flex flex-col flex-1 w-full overflow-hidden')} contentStyle={tw('flex flex-col w-full items-center')}>
        <Box style={tw('flex flex-col w-full max-w-[672px] px-4 py-6 gap-6')}>
          <Box style={tw('flex flex-row items-center gap-2')}>
            <Icon node={icons.settings} size={20} color={DOCTRINE.accent} />
            <CanvasText style={`text-xl font-bold text-[${DOCTRINE.text}]`}>{p.title}</CanvasText>
          </Box>

          <Box style={tw('flex flex-col w-full gap-4 p-4 rounded-site bg-[#141416] border border-[rgba(255,255,255,0.06)]')}>
            <Box style={tw('flex flex-col w-full gap-2')}>
              <FieldLabel>{p.languageLabel}</FieldLabel>
              <Select value={p.locale} options={p.localeOptions} onChange={p.onLocaleChange} label={p.languageLabel} />
            </Box>
            <Box style={tw('flex flex-col w-full gap-2')}>
              <FieldLabel>{p.timezoneLabel}</FieldLabel>
              <Select value={p.timezone} options={p.timezoneOptions} onChange={p.onTimezoneChange} label={p.timezoneLabel} />
              <CanvasText style="text-xs text-[rgba(255,255,255,0.3)]">{p.sahurNote}</CanvasText>
            </Box>
          </Box>

          <Box style={tw('flex flex-col w-full gap-2 p-4 rounded-site bg-[#141416] border border-[rgba(255,255,255,0.06)]')}>
            <FieldLabel>{p.tierTitle}</FieldLabel>
            <CanvasText style="text-sm text-[rgba(255,255,255,0.6)]">{p.tierBody}</CanvasText>
          </Box>
        </Box>
      </ScrollView>
    </DoctrineShell>
  );
}

function SettingsMirror(p: SettingsSceneProps) {
  return (
    <div>
      <h1>{p.title}</h1>
      <label>{p.languageLabel}
        <select value={p.locale} onChange={(e) => p.onLocaleChange(e.target.value)}>
          {p.localeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <label>{p.timezoneLabel}
        <select value={p.timezone} onChange={(e) => p.onTimezoneChange(e.target.value)}>
          {p.timezoneOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <h2>{p.tierTitle}</h2><p>{p.tierBody}</p>
    </div>
  );
}

function SettingsPage() {
  const { t } = useTranslation('nav');
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);

  const sceneProps: SettingsSceneProps = useMemo(() => ({
    title: 'Settings',
    languageLabel: t('language', { defaultValue: 'Language' }),
    timezoneLabel: 'Timezone (for Sahur Mode)',
    sahurNote: 'Sahur Mode activates at 3:00 AM in your selected timezone.',
    tierTitle: 'Account Tier',
    tierBody: 'Tier changes are managed by RMH administrators. Contact the team for upgrade requests.',
    locale,
    localeOptions: LOCALES.map((l) => ({ value: l, label: LOCALE_LABELS[l] })),
    onLocaleChange: (v) => setLocale(v as Locale),
    timezone,
    timezoneOptions: TIMEZONES.map((tz) => ({ value: tz, label: tz })),
    onTimezoneChange: setTimezone,
  }), [t, locale, setLocale, timezone]);

  return (
    <CanvasPage routeId="/strategies/profile/settings" scene={SettingsScene} sceneProps={sceneProps} mirror={<SettingsMirror {...sceneProps} />} shell="fullscreen" title="Settings" />
  );
}
