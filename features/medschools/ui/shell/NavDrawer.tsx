import { useState, type ReactNode } from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import * as Dialog from '@radix-ui/react-dialog';
import { Activity, LogIn, Menu, Mic, X, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/components/session/session-context';
import { cn } from '@/lib/utils';
import { SOURCE_PREFS } from '../../engine/source-pref';
import { SourceGlyph } from '../sources/SourceGlyph';
import { useSourcePref } from '../useSourcePref';
import { MINE, useMineNames } from './mine-places';
import { SOURCE_PREF_NAMES } from './SourceToggle';
import { ThemeToggle } from './ThemeToggle';

/**
 * The phone's navigation (owner 2026-11-27): under 600px the bar's actions are one menu button, and this drawer, which
 * slides in from the start edge, holds all of them: the member's area (or the sign-in link), Interview practice, Live
 * activity, the source choice and the light / dark switch. From 600px the bar shows `HeaderActions` as it always did
 * (CSS picks which; this one is `display: none` there, so it is never both).
 *
 * It is a Radix dialog (focus trapped, Escape and a tap on the scrim close it, focus returns to the button) portalled
 * into the app's own root, because the `--app-*` tokens live there and a portal on `<body>` would lose them. It sits
 * in the flow until opened; nothing here is fixed at rest, so the iOS bars see no edge-pinned layer.
 */
export function NavDrawer() {
  const { t } = useTranslation('medschools');
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const href = useRouterState({ select: (s) => s.location.href });
  const { data: session } = useSession();
  const names = useMineNames();
  const { value, choose } = useSourcePref();
  const [open, setOpen] = useState(false);
  // Resolved when the drawer opens (a client event): the portal target is the app root, never `<body>`.
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const at = (p: string) => pathname === p || pathname === `${p}/`;
  const close = () => setOpen(false);
  const menu = t('shell-menu', { defaultValue: 'Menu' });

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (next) setRoot(document.querySelector<HTMLElement>('.medapp-theme'));
        setOpen(next);
      }}
    >
      <Dialog.Trigger className="medapp-round medapp-menu-btn" aria-label={menu} title={menu}>
        <Menu aria-hidden size={20} />
      </Dialog.Trigger>
      <Dialog.Portal container={root}>
        <Dialog.Overlay className="medapp-drawer__scrim" />
        <Dialog.Content className="medapp-drawer" aria-describedby={undefined}>
          <div className="medapp-drawer__head">
            <Dialog.Title className="medapp-drawer__title">
              {t('shell-app-name', { defaultValue: 'RMH Med Schools' })}
            </Dialog.Title>
            <Dialog.Close className="medapp-round" aria-label={t('shell-menu-close', { defaultValue: 'Close menu' })}>
              <X aria-hidden size={20} />
            </Dialog.Close>
          </div>

          <nav className="medapp-drawer__body" aria-label={menu}>
            {session ? (
              <DrawerGroup label={t('shell-mine-label', { defaultValue: 'My cycle and lists' })}>
                {MINE.map((m) => {
                  const current = !m.hash && pathname.startsWith(m.to);
                  return (
                    <DrawerLink
                      key={m.id}
                      to={m.to}
                      {...(m.hash ? { hash: m.hash } : {})}
                      icon={m.icon}
                      current={current}
                      onGo={close}
                    >
                      {names(m.id)}
                    </DrawerLink>
                  );
                })}
              </DrawerGroup>
            ) : (
              <DrawerGroup>
                <DrawerLink to="/login" search={{ callbackURL: href }} icon={LogIn} onGo={close}>
                  {t('source-menu-signin', { defaultValue: 'Sign in' })}
                </DrawerLink>
              </DrawerGroup>
            )}

            <DrawerGroup label={t('shell-drawer-explore', { defaultValue: 'Explore' })}>
              {at('/med/practice') ? null : (
                <DrawerLink to="/med/practice" icon={Mic} onGo={close}>
                  {t('shell-practice', { defaultValue: 'Interview practice' })}
                </DrawerLink>
              )}
              {at('/med/live') ? null : (
                <DrawerLink to="/med/live" icon={Activity} onGo={close}>
                  {t('shell-live', { defaultValue: 'Live activity' })}
                </DrawerLink>
              )}
            </DrawerGroup>

            <DrawerGroup label={t('source-toggle-label', { defaultValue: 'Figures from' })}>
              <div role="radiogroup" aria-label={t('source-toggle-label', { defaultValue: 'Figures from' })}>
                {SOURCE_PREFS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={option === value}
                    className="medapp-drawer__item"
                    onClick={() => choose(option)}
                  >
                    <SourceGlyph source={option} size={18} />
                    <span>{SOURCE_PREF_NAMES[option]}</span>
                  </button>
                ))}
              </div>
            </DrawerGroup>
          </nav>

          <div className="medapp-drawer__foot">
            <span>{t('shell-theme-label', { defaultValue: 'Dark mode' })}</span>
            <ThemeToggle />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function DrawerGroup({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="medapp-drawer__group">
      {label ? <p className="medapp-drawer__label">{label}</p> : null}
      {children}
    </div>
  );
}

function DrawerLink({
  to,
  hash,
  search,
  icon: Icon,
  current,
  onGo,
  children,
}: {
  to: string;
  hash?: string;
  search?: Record<string, string>;
  icon: LucideIcon;
  current?: boolean;
  onGo: () => void;
  children: ReactNode;
}) {
  return (
    <Link
      // The destinations are a fixed list of `/med` pages (and `/login`); the cast keeps one component for all of them.
      to={to as '/med'}
      {...({ hash, search } as object)}
      className={cn('medapp-drawer__item', current && 'medapp-drawer__item--current')}
      aria-current={current ? 'page' : undefined}
      onClick={onGo}
    >
      <Icon aria-hidden size={18} />
      <span>{children}</span>
    </Link>
  );
}
