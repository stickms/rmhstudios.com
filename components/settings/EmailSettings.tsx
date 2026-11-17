import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { toast } from '@/lib/toast';
import { Switch } from '@/components/ui/switch';
import { useArrival } from '@/components/ui/arrive';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { EMAIL_CATEGORIES, type EmailCategory, type EmailPrefs } from '@/lib/email/preferences';
import { setEmailPrefsApi } from '@/lib/preferences/preferences.contract';
import { emailPrefsQuery } from '@/lib/settings/prefs.queries';
import { api } from '@/lib/contract/client';

// Literal t() keys per category: i18next-parser cannot see a templated key.
function label(t: TFunction, cat: EmailCategory): string {
  switch (cat) {
    case 'security':
      return t('email-security', { defaultValue: 'Account security' });
    case 'announcements':
      return t('email-announcements', { defaultValue: 'Site announcements' });
    case 'product':
      return t('email-product', { defaultValue: 'Product news and tips' });
    case 'digest':
      return t('email-digest', { defaultValue: 'Weekly digest' });
  }
}

function hint(t: TFunction, cat: EmailCategory): string {
  switch (cat) {
    case 'security':
      return t('email-security-desc', {
        defaultValue:
          'Sign-ins from a new device and changes to how you sign in. We recommend leaving this on.',
      });
    case 'announcements':
      return t('email-announcements-desc', {
        defaultValue: 'Important news about RMH Studios, a few times a year.',
      });
    case 'product':
      return t('email-product-desc', {
        defaultValue: 'New games, apps and features.',
      });
    case 'digest':
      return t('email-digest-desc', {
        defaultValue: 'A weekly summary of activity you missed.',
      });
  }
}

/**
 * Email preferences: one switch per category. Security and announcements are
 * on by default, product news and the digest are opt-in
 * (`lib/email/preferences.ts`). Notices about the account or the service that
 * we are required to send are not listed, because they cannot be turned off.
 */
export function EmailSettings() {
  const { t } = useTranslation('settings-notifications');
  const queryClient = useQueryClient();
  const query = emailPrefsQuery();
  // Seeded by the route loader (`/settings/notifications`), so it is usually there on first paint.
  const { data } = useQuery(query);
  const prefs: EmailPrefs | null = data ?? null;
  const arrival = useArrival(prefs !== null);
  const setPrefs = (next: EmailPrefs) => queryClient.setQueryData(query.queryKey, next);

  function toggle(cat: EmailCategory, value: boolean) {
    if (!prefs) return;
    const previous = prefs;
    setPrefs({ ...prefs, [cat]: value });
    api(setEmailPrefsApi, { body: { [cat]: value } })
      .then(setPrefs)
      .catch(() => {
        setPrefs(previous);
        toast.error(t('error', { defaultValue: 'Something went wrong' }));
      });
  }

  if (!prefs) return null;

  return (
    <SettingsSection
      className={arrival}
      title={t('email-title', { defaultValue: 'Email' })}
      description={t('email-desc', {
        defaultValue:
          'Choose which emails we send you. Required notices about your account or the service are always sent.',
      })}
    >
      <ul className="divide-y divide-site-border">
        {EMAIL_CATEGORIES.map((cat) => (
          <li key={cat}>
            <div className="flex min-h-11 items-center justify-between gap-3 py-3">
              <span className="min-w-0">
                <span
                  id={`email-pref-${cat}`}
                  className="block t-body text-site-text"
                >
                  {label(t, cat)}
                </span>
                <span
                  id={`email-pref-${cat}-desc`}
                  className="block t-meta"
                >
                  {hint(t, cat)}
                </span>
              </span>
              <Switch
                checked={prefs[cat]}
                aria-labelledby={`email-pref-${cat}`}
                aria-describedby={`email-pref-${cat}-desc`}
                onCheckedChange={(v) => toggle(cat, v)}
              />
            </div>
          </li>
        ))}
      </ul>
    </SettingsSection>
  );
}
