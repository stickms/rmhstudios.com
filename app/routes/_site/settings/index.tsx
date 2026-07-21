/**
 * Settings hub — one place for appearance, language, notifications, and
 * account management. Theme and language work signed-out; notification and
 * account sections prompt for sign-in.
 */

import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  Palette,
  Languages,
  Bell,
  User,
  KeyRound,
  ShieldUser,
  Wallet,
  Zap,
  ChevronRight,
  Sparkles,
  LayoutDashboard,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { ThemeGallery } from '@/components/settings/ThemeGallery';
import { AccentPicker } from '@/components/settings/AccentPicker';
import { NotificationPrefsPanel } from '@/components/settings/NotificationPrefsPanel';
import { LanguageSwitcher } from '@/components/site/LanguageSwitcher';
import { useSession } from '@/components/Providers';
import { Switch } from '@/components/ui/switch';
import { useThemeStore } from '@/stores/themeStore';

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

function SettingsPage() {
  const { t } = useTranslation('feed');
  const { data: session, isPending } = useSession();
  const reduceTransparency = useThemeStore((s) => s.reduceTransparency);
  const setReduceTransparency = useThemeStore((s) => s.setReduceTransparency);
  const signedIn = !!session?.user;
  const handle = (session?.user as { handle?: string | null } | undefined)?.handle;

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
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-site-text-dim">
              {t('settings-accent-title', { defaultValue: 'Accent color' })}
            </h3>
            <p className="mb-3 text-xs text-site-text-muted">
              {t('settings-accent-hint', {
                defaultValue: 'Recolor highlights on top of any theme, or keep the theme default.',
              })}
            </p>
            <AccentPicker />
          </div>

          {/* Reduce transparency — collapse the glass to opaque surfaces. The
                manual equivalent of the OS setting (and the only way Firefox
                users can turn glass off). */}
          <div className="mt-5 flex items-center justify-between gap-3 border-t border-site-border pt-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-site-text">
                {t('settings-reduce-transparency', { defaultValue: 'Reduce transparency' })}
              </p>
              <p className="text-xs text-site-text-muted">
                {t('settings-reduce-transparency-hint', {
                  defaultValue:
                    'Turn off the frosted-glass blur for solid, higher-contrast surfaces.',
                })}
              </p>
            </div>
            <Switch
              checked={reduceTransparency}
              onCheckedChange={setReduceTransparency}
              aria-label={t('settings-reduce-transparency', {
                defaultValue: 'Reduce transparency',
              })}
            />
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-site border border-site-border bg-site-bg-subtle px-3 py-2.5">
            <Sparkles className="h-4 w-4 shrink-0 text-site-accent" aria-hidden />
            <p className="text-xs text-site-text-muted">
              {t('settings-premium-themes', {
                defaultValue: 'Looking for more? Premium profile themes are in the shop.',
              })}{' '}
              <Link to="/shop" className="text-site-accent hover:underline">
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

        <SectionCard
          id="personalization"
          icon={LayoutDashboard}
          title={t('settings-personalization', { defaultValue: 'Personalization' })}
          subtitle={t('settings-personalization-hint', {
            defaultValue: 'Arrange your home widgets and sidebar.',
          })}
        >
          <div className="-mx-3 flex flex-col">
            <AccountLink
              to="/settings/layout"
              icon={SlidersHorizontal}
              label={t('settings-layout', { defaultValue: 'Home & sidebar layout' })}
              hint={t('settings-layout-hint', {
                defaultValue: 'Reorder home widgets; pin or hide sidebar items',
              })}
            />
            <AccountLink
              to="/settings/notifications"
              icon={Bell}
              label={t('settings-notifications-advanced', {
                defaultValue: 'Notification channels & quiet hours',
              })}
              hint={t('settings-notifications-advanced-hint', {
                defaultValue: 'Per-category push, in-app, and email',
              })}
            />
          </div>
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

        <SectionCard
          id="account"
          icon={User}
          title={t('settings-account', { defaultValue: 'Account' })}
          subtitle={t('settings-account-hint', {
            defaultValue: 'Profile, security, privacy, and your wallet.',
          })}
        >
          {!isPending && !signedIn ? (
            signInPrompt
          ) : (
            <div className="-mx-3 flex flex-col">
              {handle && (
                <AccountLink
                  to={`/u/${handle}`}
                  icon={User}
                  label={t('settings-account-profile', { defaultValue: 'Profile' })}
                  hint={t('settings-account-profile-hint', {
                    defaultValue: 'Your public page and posts',
                  })}
                />
              )}
              <AccountLink
                to="/settings/security"
                icon={KeyRound}
                label={t('settings-account-security', { defaultValue: 'Passkeys & security' })}
                hint={t('settings-account-security-hint', {
                  defaultValue: 'Passkeys, sessions, and devices',
                })}
              />
              <AccountLink
                to="/settings/privacy"
                icon={ShieldUser}
                label={t('settings-account-privacy', { defaultValue: 'Privacy & data' })}
                hint={t('settings-account-privacy-hint', {
                  defaultValue: 'Export or delete your data',
                })}
              />
              <AccountLink
                to="/wallet"
                icon={Wallet}
                label={t('settings-account-wallet', { defaultValue: 'Wallet' })}
                hint={t('settings-account-wallet-hint', {
                  defaultValue: 'Coins, transactions, and memberships',
                })}
              />
              <AccountLink
                to="/progress"
                icon={Zap}
                label={t('settings-account-progress', { defaultValue: 'Progress' })}
                hint={t('settings-account-progress-hint', {
                  defaultValue: 'XP, streaks, quests, and achievements',
                })}
              />
            </div>
          )}
        </SectionCard>
      </div>
    </PageLayout>
  );
}
