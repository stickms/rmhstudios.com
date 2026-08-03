/**
 * Settings hub — one place for appearance, language, notifications, and
 * account management. Theme and language work signed-out; notification and
 * account sections prompt for sign-in.
 */

import { useMemo, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  Palette,
  Languages,
  Bell,
  User,
  ChevronRight,
  Sparkles,
  LayoutDashboard,
  type LucideIcon,
} from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { ThemeGallery } from '@/components/settings/ThemeGallery';
import { AccentPicker } from '@/components/settings/AccentPicker';
import { NotificationPrefsPanel } from '@/components/settings/NotificationPrefsPanel';
import { LanguageSwitcher } from '@/components/site/LanguageSwitcher';
import { useSession } from '@/components/Providers';
import { SearchField } from '@/components/ui/search-field';
import {
  SETTINGS_DESTINATIONS,
  filterSettings,
  type SettingsGroup,
} from '@/lib/settings-nav';

export const Route = createFileRoute('/_site/settings/')({
  head: () => ({
    meta: [{ title: 'Settings | RMH Studios' }],
  }),
  component: SettingsPage,
});

function SectionCard({
  id,
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      // Discrete floating L2 slab (§8.4); rows keep their hairlines INSIDE.
      className="glass-pane rounded-site p-4"
    >
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-4.5 w-4.5 text-site-accent" aria-hidden />
        <div>
          <h2 id={`${id}-heading`} className="text-sm font-bold text-site-text">
            {title}
          </h2>
          <p className="text-xs text-site-text-muted">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function AccountLink({
  to,
  icon: Icon,
  label,
  hint,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
  hint: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-site px-3 py-2.5 text-sm transition-colors hover:bg-site-surface-hover"
    >
      <Icon className="h-4 w-4 shrink-0 text-site-text-dim" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-site-text">{label}</span>
        <span className="block text-xs text-site-text-muted">{hint}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-site-text-dim" aria-hidden />
    </Link>
  );
}

const GROUP_ORDER: SettingsGroup[] = ['personalization', 'content', 'account'];

const GROUP_LABELS: Record<SettingsGroup, (t: TFunction) => string> = {
  personalization: (t) => t('settings-group-personalization', { defaultValue: 'Personalization' }),
  content: (t) => t('settings-group-content', { defaultValue: 'Content & audience' }),
  account: (t) => t('settings-group-account', { defaultValue: 'Account' }),
};

function SettingsPage() {
  const { t } = useTranslation('feed');
  const { data: session, isPending } = useSession();
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
      <Link
        to="/login"
        search={{ callbackURL: '/settings' }}
        className="text-site-accent hover:underline"
      >
        {t('settings-sign-in', { defaultValue: 'Sign in' })}
      </Link>{' '}
      {t('settings-sign-in-rest', { defaultValue: 'to manage this section.' })}
    </p>
  );

  return (
    // PageLayout rather than a hand-rolled header: it supplies the back arrow
    // and the mobile drawer button, and matches the sibling settings pages
    // (privacy, security), which already use it. Settings is reached from the
    // sidebar gear on every page, so "back" targets the feed rather than a
    // parent. The subtitle moves into the content as the first <p>, which is
    // how privacy/security do it — keeping the sticky header compact.
    <PageLayout
      title={t('settings-title', { defaultValue: 'Settings' })}
      wide
      backTo="/"
      backLabel={t('settings-back', { defaultValue: 'Back' })}
    >
      <div className="space-y-4 p-4">
        <p className="text-sm text-site-text-muted">
          {t('settings-subtitle', {
            defaultValue: 'Appearance, language, notifications, and your account.',
          })}
        </p>
        <SectionCard
          id="appearance"
          icon={Palette}
          title={t('settings-appearance', { defaultValue: 'Appearance' })}
          subtitle={t('settings-appearance-hint', {
            defaultValue:
              "Theme and accent apply instantly — and follow you across devices when you're signed in.",
          })}
        >
          <ThemeGallery />

          <div className="mt-5 border-t border-site-border pt-4">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-site-text-muted">
              {t('settings-accent-title', { defaultValue: 'Accent color' })}
            </h3>
            <p className="mb-3 text-xs text-site-text-muted">
              {t('settings-accent-hint', {
                defaultValue: 'Recolor highlights on top of any theme, or keep the theme default.',
              })}
            </p>
            <AccentPicker />
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-site border border-site-border bg-site-bg-subtle px-3 py-2.5">
            <Sparkles className="h-4 w-4 shrink-0 text-site-accent" aria-hidden />
            <p className="text-xs text-site-text-muted">
              {t('settings-premium-themes', {
                defaultValue: 'Looking for more? Premium profile themes are in the shop.',
              })}{' '}
              <Link
                to="/store"
                search={{ tab: 'shop' }}
                className="text-site-accent hover:underline"
              >
                {t('settings-premium-themes-link', { defaultValue: 'Browse the shop' })}
              </Link>{' '}
              {t('settings-premium-themes-or', { defaultValue: 'or' })}{' '}
              <Link to="/settings/profile" className="text-site-accent hover:underline">
                {t('settings-premium-themes-equip-link', {
                  defaultValue: 'equip what you own',
                })}
              </Link>
            </p>
          </div>
        </SectionCard>

        <SectionCard
          id="language"
          icon={Languages}
          title={t('settings-language', { defaultValue: 'Language' })}
          subtitle={t('settings-language-hint', {
            defaultValue: 'RMH Studios is available in 32 languages.',
          })}
        >
          <LanguageSwitcher />
        </SectionCard>

        {/* Every settings destination, from one catalog (`lib/settings-nav.ts`)
            and filterable. The hub used to hand-list six of the eleven
            destinations, so appearance, content preferences, close friends and
            the theme studio were reachable only by knowing the URL — a new
            settings page was a route, and updating this page was a separate
            step someone had to remember. */}
        <SectionCard
          id="all-settings"
          icon={LayoutDashboard}
          title={t('settings-all', { defaultValue: 'All settings' })}
          subtitle={t('settings-all-hint', {
            defaultValue: 'Everything you can change, in one list.',
          })}
        >
          <SearchField
            value={query}
            onValueChange={setQuery}
            placeholder={t('settings-search-placeholder', {
              defaultValue: 'Search settings — try "dark mode" or "export"',
            })}
            aria-label={t('settings-search-label', { defaultValue: 'Search settings' })}
          />

          {!isPending && !signedIn && <div className="mt-3">{signInPrompt}</div>}

          {groups.map(({ group, items }) => (
            <div key={group} className="mt-4">
              <h3 className="mb-1 text-xs font-bold uppercase tracking-wider text-site-text-muted">
                {GROUP_LABELS[group](t)}
              </h3>
              <div className="-mx-3 flex flex-col">
                {items.map((d) => (
                  <AccountLink
                    key={d.id}
                    to={d.to}
                    icon={d.icon}
                    label={t(`settings-nav-${d.id}`, { defaultValue: d.label })}
                    hint={t(`settings-nav-${d.id}-hint`, { defaultValue: d.hint })}
                  />
                ))}
              </div>
            </div>
          ))}

          {signedIn && handle && !query && (
            <div className="-mx-3 mt-4 border-t border-site-border pt-2">
              <AccountLink
                to={`/u/${handle}`}
                icon={User}
                label={t('settings-account-profile', { defaultValue: 'View your profile' })}
                hint={t('settings-account-profile-hint', {
                  defaultValue: 'Your public page and posts',
                })}
              />
            </div>
          )}

          {groups.length === 0 && (
            <p className="mt-4 text-sm text-site-text-muted">
              {t('settings-search-empty', {
                query,
                defaultValue: 'Nothing in settings matches "{{query}}".',
              })}
            </p>
          )}
        </SectionCard>

        <SectionCard
          id="notifications"
          icon={Bell}
          title={t('settings-notifications', { defaultValue: 'Notifications' })}
          subtitle={t('settings-notifications-hint', {
            defaultValue: 'Choose which activity creates a notification.',
          })}
        >
          {!isPending && !signedIn ? signInPrompt : <NotificationPrefsPanel />}
        </SectionCard>
      </div>
    </PageLayout>
  );
}
