import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLocaleStore } from '@/stores/localeStore';
import { LOCALES, LOCALE_LABELS, type Locale } from '@/lib/i18n/config';

export const Route = createFileRoute('/strategies/profile/settings')({
  component: SettingsPage,
});

function SettingsPage() {
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const { t } = useTranslation('nav');
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6 pb-20 md:pb-6">
      <div className="flex items-center gap-2">
        <Settings size={20} style={{ color: 'var(--doctrine-accent)' }} />
        <h1 className="text-xl font-bold" style={{ color: 'var(--doctrine-text-primary)' }}>
          Settings
        </h1>
      </div>

      <div className="rounded-lg p-4 space-y-4" style={{ background: 'var(--doctrine-bg-secondary)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="space-y-2">
          <label className="text-xs font-mono uppercase tracking-wider text-white/40">
            {t('language')}
          </label>
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value as Locale)}
            className="w-full text-sm bg-white/5 border border-white/10 rounded-lg p-2.5 text-white/80 focus:outline-none focus:border-white/20"
          >
            {LOCALES.map((l) => (
              <option key={l} value={l}>{LOCALE_LABELS[l]}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-mono uppercase tracking-wider text-white/40">
            Timezone (for Sahur Mode)
          </label>
          <select
            value={timezone}
            onChange={e => setTimezone(e.target.value)}
            className="w-full text-sm bg-white/5 border border-white/10 rounded-lg p-2.5 text-white/80 focus:outline-none focus:border-white/20"
          >
            {Intl.supportedValuesOf('timeZone').map(tz => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
          <p className="text-[10px] text-white/30">
            Sahur Mode activates at 3:00 AM in your selected timezone.
          </p>
        </div>
      </div>

      <div className="rounded-lg p-4 space-y-2" style={{ background: 'var(--doctrine-bg-secondary)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <h3 className="text-xs font-mono uppercase tracking-wider text-white/40">Account Tier</h3>
        <p className="text-sm text-white/60">
          Tier changes are managed by RMH administrators.
          Contact the team for upgrade requests.
        </p>
      </div>
    </div>
  );
}
