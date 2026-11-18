/**
 * Settings hub — one place for appearance, language, notifications, and
 * account management. Theme and language work signed-out; notification and
 * account sections prompt for sign-in.
 */

import { useMemo, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { fetchOwnedThemes } from '@/lib/themes/owned-themes.functions';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { SettingsPageBody, SettingsSection } from '@/components/settings/SettingsSection';
import { ThemePicker } from '@/components/settings/ThemePicker';
import { AccentPicker } from '@/components/settings/AccentPicker';
import { LanguageSwitcher } from '@/components/site/LanguageSwitcher';
import { useSession } from '@/components/Providers';
import { SearchField } from '@/components/ui/search-field';
import { SETTINGS_DESTINATIONS, filterSettings, type SettingsGroup } from '@/lib/settings-nav';

export const Route = createFileRoute('/_site/settings/')({
  head: () => ({
    meta: [{ title: 'Settings | RMH Studios' }],
  }),
  loader: async () => ({ ownedThemes: await fetchOwnedThemes() }),
  component: SettingsPage,
});

/** A destination: name and one line on the left, a chevron at the end, on a rule. */
function DestinationRow({ to, label, hint }: { to: string; label: string; hint: string }) {
  return (
    <Link to={to} className="settings-row">
      <span className="settings-row__text">
        <span className="settings-row__name block">{label}</span>
        <span className="settings-row__hint block">{hint}</span>
      </span>
      <ChevronRight className="settings-row__mark rtl:-scale-x-100" aria-hidden />
    </Link>
  );
}

const GROUP_ORDER: SettingsGroup[] = ['personalization', 'content', 'account'];

function SettingsPage() {
  const { t } = useTranslation('feed');
  const { data: session, isPending } = useSession();
  const { ownedThemes } = Route.useLoaderData();
  const signedIn = !!session?.user;
  const handle = (session?.user as { handle?: string | null } | undefined)?.handle;
  const [query, setQuery] = useState('');

  // Signed-out visitors see only what they can actually change (theme,
  // language, accessibility) rather than a list of links to a sign-in prompt.
  const groups = useMemo(() => {
    const visible = SETTINGS_DESTINATIONS.filter((d) => signedIn || !d.requiresAuth);
    const matched = filterSettings(visible, query);
    return GROUP_ORDER.map((group) => ({
      group,
      items: matched.filter((d) => d.group === group),
    })).filter((g) => g.items.length > 0);
  }, [signedIn, query]);

  const signInPrompt = (
    <p className="text-sm text-site-text-muted">
      <Link to="/login" search={{ callbackURL: '/settings' }} className="underline">
        {t('settings-sign-in', { defaultValue: 'Sign in' })}
      </Link>{' '}
      {t('settings-sign-in-rest', { defaultValue: 'to manage this section.' })}
    </p>
  );

  // The notification grid is the one place "what notifies me" is set; Alerts links to it rather than repeating it.
  const isAlert = (d: { id: string }) => d.id === 'notifications';
  const alertItems = SETTINGS_DESTINATIONS.filter((d) => isAlert(d) && (signedIn || !d.requiresAuth));
  const lookItems = (groups.find((g) => g.group === 'personalization')?.items ?? []).filter(
    (d) => !isAlert(d),
  );
  const accountItems = groups.filter((g) => g.group !== 'personalization').flatMap((g) => g.items);
  const row = (d: (typeof lookItems)[number]) => (
    <DestinationRow
      key={d.id}
      to={d.to}
      label={t(`settings-nav-${d.id}`, { defaultValue: d.label })}
      hint={t(`settings-nav-${d.id}-hint`, { defaultValue: d.hint })}
    />
  );

  // Steel section 10, Settings: stations "Look", "Alerts", "Account"; each setting is a row. The page is the two-column
  // frame at every width (L3). The search filters the destination rows only.
  return (
    <PageLayout
      title={t('settings-title', { defaultValue: 'Settings' })}
      description={t('settings-subtitle', {
        defaultValue: 'Appearance, language, notifications, and your account.',
      })}
      wide
    >
      <div data-slot="page-controls" className="mb-2 max-w-md">
        <SearchField
          value={query}
          onValueChange={setQuery}
          placeholder={t('settings-search-placeholder', {
            defaultValue: 'Search settings — try "dark mode" or "export"',
          })}
          aria-label={t('settings-search-label', { defaultValue: 'Search settings' })}
        />
      </div>

      <SettingsPageBody>
        {(!query || lookItems.length > 0) && (
          <SettingsSection
            id="appearance"
            title={t('settings-look', { defaultValue: 'Look' })}
            description={
              query
                ? undefined
                : t('settings-appearance-hint', {
                    defaultValue:
                      "Theme and accent apply instantly — and follow you across devices when you're signed in.",
                  })
            }
          >
            {!query && (
              <div>
                <ThemePicker owned={ownedThemes} />
                <AccentPicker />
                <div id="language" className="settings-row">
                  <span className="settings-row__text">
                    <span className="settings-row__name block">
                      {t('settings-language', { defaultValue: 'Language' })}
                    </span>
                    <span className="settings-row__hint block">
                      {t('settings-language-hint', {
                        defaultValue: 'RMH Studios is available in 32 languages.',
                      })}
                    </span>
                  </span>
                  <LanguageSwitcher />
                </div>
              </div>
            )}
            {lookItems.length > 0 && <div>{lookItems.map(row)}</div>}
          </SettingsSection>
        )}

        {!query && (
          <SettingsSection
            id="notifications"
            title={t('settings-alerts', { defaultValue: 'Alerts' })}
            description={t('settings-alerts-hint', {
              defaultValue: 'What notifies you, where, and when it stays quiet.',
            })}
          >
            {!isPending && !signedIn ? signInPrompt : <div>{alertItems.map(row)}</div>}
          </SettingsSection>
        )}

        <SettingsSection
          id="all-settings"
          title={t('settings-group-account', { defaultValue: 'Account' })}
        >
          {!isPending && !signedIn && signInPrompt}
          <div>
            {accountItems.map(row)}
            {signedIn && handle && !query && (
              <DestinationRow
                to={`/u/${handle}`}
                label={t('settings-account-profile', { defaultValue: 'View your profile' })}
                hint={t('settings-account-profile-hint', {
                  defaultValue: 'Your public page and posts',
                })}
              />
            )}
          </div>
          {groups.length === 0 && (
            <p className="text-sm text-site-text-muted">
              {t('settings-search-empty', {
                query,
                defaultValue: 'Nothing in settings matches "{{query}}".',
              })}
            </p>
          )}
        </SettingsSection>
      </SettingsPageBody>
    </PageLayout>
  );
}
