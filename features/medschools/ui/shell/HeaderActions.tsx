import { useRef, useState } from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import {
  Activity,
  BarChart3,
  CalendarCheck,
  ListChecks,
  MessageCircleQuestion,
  Mic,
  SlidersHorizontal,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { MenuItem } from '@/components/ui/menu';
import { useSession } from '@/components/session/session-context';
import { cn } from '@/lib/utils';
import { ThemeToggle } from './ThemeToggle';

/**
 * The top bar's actions (owner 2026-11-24): Interview practice, Live activity, the member's own area and the light /
 * dark switch, as 44px round icon buttons, each named and titled. A page does not link to itself: the live page has no
 * Live button and the practice page no practice button; on the member's own pages the profile button shows as current.
 *
 * Signed in, the profile button opens a small menu of the member's places (their cycle, their lists, preferences, Ask);
 * signed out it is a link to sign in that returns to this page. Nothing here is fixed or sticky.
 */
export function HeaderActions() {
  const { t } = useTranslation('medschools');
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const href = useRouterState({ select: (s) => s.location.href });
  const at = (p: string) => pathname === p || pathname === `${p}/`;
  return (
    <div className="medapp-bar__actions" role="group" aria-label={t('shell-actions-label', { defaultValue: 'Go to' })}>
      {at('/med/practice') ? null : (
        <RoundLink to="/med/practice" icon={Mic} label={t('shell-practice', { defaultValue: 'Interview practice' })} />
      )}
      {at('/med/live') ? null : (
        <RoundLink to="/med/live" icon={Activity} label={t('shell-live', { defaultValue: 'Live activity' })} />
      )}
      <ProfileButton pathname={pathname} href={href} />
      <ThemeToggle />
    </div>
  );
}

function RoundLink({ to, icon: Icon, label }: { to: '/med/practice' | '/med/live'; icon: LucideIcon; label: string }) {
  return (
    <Link to={to} className="medapp-round" aria-label={label} title={label}>
      <Icon aria-hidden="true" size={18} />
    </Link>
  );
}

// The member's places. "My stats" (phase D) is the private stats; the AI list builder is reached from My school lists.
type Mine = 'cycle' | 'lists' | 'stats' | 'prefs' | 'ask';
const MINE: { id: Mine; to: string; hash?: string; icon: LucideIcon }[] = [
  { id: 'cycle', to: '/med/tracker', icon: CalendarCheck },
  { id: 'lists', to: '/med/lists', icon: ListChecks },
  { id: 'stats', to: '/med/stats', icon: BarChart3 },
  { id: 'prefs', to: '/med/lists', hash: 'preferences', icon: SlidersHorizontal },
  { id: 'ask', to: '/med/ask', icon: MessageCircleQuestion },
];

function ProfileButton({ pathname, href }: { pathname: string; href: string }) {
  const { t } = useTranslation('medschools');
  const { data: session } = useSession();
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const label = t('shell-mine-label', { defaultValue: 'My cycle and lists' });
  const mine = MINE.some((m) => pathname.startsWith(m.to));
  const name = (id: Mine): string => {
    switch (id) {
      case 'cycle':
        return t('shell-mine-cycle', { defaultValue: 'My cycle' });
      case 'lists':
        return t('shell-mine-lists', { defaultValue: 'My school lists' });
      case 'stats':
        return t('shell-mine-stats', { defaultValue: 'My stats' });
      case 'prefs':
        return t('shell-mine-prefs', { defaultValue: 'Preferences' });
      case 'ask':
        return t('shell-mine-ask', { defaultValue: 'Ask about schools' });
    }
  };

  if (!session) {
    return (
      <Link
        to="/login"
        search={{ callbackURL: href }}
        className="medapp-round"
        aria-label={t('shell-mine-signin', { defaultValue: 'Sign in to see your cycle and lists' })}
        title={label}
      >
        <UserRound aria-hidden="true" size={18} />
      </Link>
    );
  }
  const image = session.user.image;
  return (
    <>
      <button
        ref={ref}
        type="button"
        className={cn('medapp-round', mine && 'medapp-round--current', image && 'medapp-round--avatar')}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {image ? <img src={image} alt="" width={44} height={44} /> : <UserRound aria-hidden="true" size={18} />}
      </button>
      <AnchoredMenu open={open} onClose={() => setOpen(false)} anchorRef={ref} label={label} className="w-60">
        {MINE.map((m) => {
          const current = !m.hash && pathname.startsWith(m.to);
          return (
            <MenuItem
              key={m.id}
              icon={m.icon}
              href={m.to}
              {...(m.hash ? ({ hash: m.hash } as object) : {})}
              onSelect={() => setOpen(false)}
              aria-current={current ? 'page' : undefined}
              className={current ? 'font-semibold' : undefined}
            >
              {name(m.id)}
            </MenuItem>
          );
        })}
      </AnchoredMenu>
    </>
  );
}
