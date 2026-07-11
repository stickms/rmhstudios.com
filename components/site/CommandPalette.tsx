'use client';

/**
 * Global ⌘K / Ctrl+K command palette.
 *
 * A single fuzzy-searchable launcher for the whole platform: site pages,
 * every game and app, theme switching, and quick actions (new post, check in,
 * sign out). Mounted once in <Providers> so it works on any route, including
 * full-screen games. Other surfaces can open it programmatically by
 * dispatching the `rmh:command-palette` window event.
 */

import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import Fuse from 'fuse.js';
import { useTranslation } from 'react-i18next';
import {
  Home, Compass, Inbox, Bell, Bookmark, Library, Users, ShoppingBag,
  TrendingUp, Wand2, Trophy, Wallet, Puzzle, Newspaper, BookOpen,
  Map as MapIcon, Gem, Gamepad2, Keyboard, LayoutGrid, PenSquare, Flame, LogOut, User,
  KeyRound, ShieldUser, Search, SlidersHorizontal, CornerDownLeft, type LucideIcon,
} from 'lucide-react';
import { games } from '@/lib/games';
import { apps } from '@/lib/apps';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { SITE_STYLES, useThemeStore, type SiteStyle } from '@/stores/themeStore';
import { useSession } from '@/components/Providers';
import { authClient } from '@/lib/auth-client';

// Loaded on demand so the palette (mounted on every route, including games)
// doesn't pull the compose stack into the initial bundle.
const ComposeModal = lazy(() =>
  import('@/components/feed/ComposeModal').then((m) => ({ default: m.ComposeModal }))
);

export const COMMAND_PALETTE_EVENT = 'rmh:command-palette';

/** Open the palette from anywhere (e.g. a toolbar search button). */
export function openCommandPalette() {
  window.dispatchEvent(new CustomEvent(COMMAND_PALETTE_EVENT));
}

type Section = 'pages' | 'games' | 'apps' | 'actions' | 'themes' | 'people' | 'posts';

interface Command {
  id: string;
  label: string;
  section: Section;
  keywords: string;
  icon?: LucideIcon;
  emoji?: string;
  /** Avatar URL for server-search results (people). */
  image?: string | null;
  /** Secondary text after the label (e.g. @handle, post author). */
  sublabel?: string;
  /** Present for navigation commands. */
  href?: string;
  external?: boolean;
  requiresAuth?: boolean;
  run?: () => void | Promise<void>;
}

const PAGES: Array<Omit<Command, 'section'>> = [
  { id: 'page-home', label: 'Home', href: '/', icon: Home, keywords: 'feed timeline' },
  { id: 'page-explore', label: 'Explore & Search', href: '/search', icon: Compass, keywords: 'search find discover trending' },
  { id: 'page-messages', label: 'Messages', href: '/messages', icon: Inbox, keywords: 'inbox dm chat conversations', requiresAuth: true },
  { id: 'page-notifications', label: 'Notifications', href: '/notifications', icon: Bell, keywords: 'alerts mentions activity', requiresAuth: true },
  { id: 'page-bookmarks', label: 'Bookmarks', href: '/bookmarks', icon: Bookmark, keywords: 'saved posts', requiresAuth: true },
  { id: 'page-library', label: 'Library', href: '/library', icon: Library, keywords: 'books reading documents' },
  { id: 'page-communities', label: 'Communities', href: '/communities', icon: Users, keywords: 'groups clubs' },
  { id: 'page-store', label: 'Store', href: '/store', icon: ShoppingBag, keywords: 'shop marketplace buy' },
  { id: 'page-predictions', label: 'Predictions', href: '/predictions', icon: TrendingUp, keywords: 'bets markets coins' },
  { id: 'page-create', label: 'Creator Studio', href: '/create', icon: Wand2, keywords: 'vibe build ai generate' },
  { id: 'page-achievements', label: 'Achievements', href: '/achievements', icon: Trophy, keywords: 'badges progress streaks journey', requiresAuth: true },
  { id: 'page-wallet', label: 'Wallet', href: '/wallet', icon: Wallet, keywords: 'coins balance transactions', requiresAuth: true },
  { id: 'page-daily', label: 'Daily Puzzles', href: '/daily', icon: Puzzle, keywords: 'lights out alibi spectrum outcast chainlink impostor' },
  { id: 'page-blog', label: 'Blog', href: '/blog', icon: Newspaper, keywords: 'articles research posts' },
  { id: 'page-news', label: 'News', href: '/news', icon: Newspaper, keywords: 'headlines updates' },
  { id: 'page-study', label: 'Study Decks', href: '/study', icon: BookOpen, keywords: 'flashcards learn revision' },
  { id: 'page-roadmap', label: 'Roadmap', href: '/roadmap', icon: MapIcon, keywords: 'plans upcoming features' },
  { id: 'page-pricing', label: 'Pricing', href: '/pricing', icon: Gem, keywords: 'subscription membership plans upgrade' },
  { id: 'page-ranked', label: 'Ranked', href: '/ranked', icon: Trophy, keywords: 'leaderboard elo competitive' },
  { id: 'page-settings', label: 'Settings', href: '/settings', icon: SlidersHorizontal, keywords: 'settings preferences appearance theme language locale notifications account' },
  { id: 'page-security', label: 'Passkeys & Security', href: '/settings/security', icon: KeyRound, keywords: 'passkey webauthn password sign-in settings account sessions devices', requiresAuth: true },
  { id: 'page-privacy', label: 'Privacy & Data', href: '/settings/privacy', icon: ShieldUser, keywords: 'privacy data export download gdpr delete account erasure settings', requiresAuth: true },
];

const SECTION_LABELS: Record<Section, { key: string; fallback: string }> = {
  actions: { key: 'palette-section-actions', fallback: 'Actions' },
  pages: { key: 'palette-section-pages', fallback: 'Pages' },
  people: { key: 'palette-section-people', fallback: 'People' },
  posts: { key: 'palette-section-posts', fallback: 'Posts' },
  games: { key: 'palette-section-games', fallback: 'Games' },
  apps: { key: 'palette-section-apps', fallback: 'Apps' },
  themes: { key: 'palette-section-themes', fallback: 'Themes' },
};

const SECTION_ORDER: Section[] = ['actions', 'pages', 'people', 'posts', 'games', 'apps', 'themes'];

const EMPTY_REMOTE: { people: Command[]; posts: Command[] } = { people: [], posts: [] };

interface SearchPerson {
  id: string;
  name: string | null;
  handle: string | null;
  image: string | null;
}

interface SearchPost {
  id: string;
  content: string;
  user: { name: string | null; handle: string | null } | null;
}

export function CommandPalette() {
  const { t } = useTranslation('feed');
  const navigate = useNavigate();
  const { data: session } = useSession();
  const setStyle = useThemeStore((s) => s.setStyle);
  const [open, setOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [remote, setRemote] = useState(EMPTY_REMOTE);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const signedIn = !!session?.user;
  const userHandle = (session?.user as { handle?: string | null } | undefined)?.handle;

  // ⌘K / Ctrl+K global shortcut + programmatic open event.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(COMMAND_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(COMMAND_PALETTE_EVENT, onOpen);
    };
  }, []);

  // Reset state each time the palette opens.
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      setRemote(EMPTY_REMOTE);
    }
  }, [open]);

  // Debounced server search: people + posts join the local fuzzy results so
  // ⌘K works as a real quick-switcher, not just a static page list.
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setRemote(EMPTY_REMOTE);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          credentials: 'include',
          signal: ctrl.signal,
        });
        if (!res.ok) return;
        const data: { people?: SearchPerson[]; posts?: SearchPost[] } = await res.json();
        setRemote({
          people: (data.people ?? []).slice(0, 5).map((u) => ({
            id: `person-${u.id}`,
            label: u.name || u.handle || t('palette-user', { defaultValue: 'User' }),
            section: 'people' as const,
            keywords: '',
            image: u.image,
            sublabel: u.handle ? `@${u.handle}` : undefined,
            href: `/u/${u.handle ?? u.id}`,
          })),
          posts: (data.posts ?? []).slice(0, 5).map((p) => ({
            id: `post-${p.id}`,
            label: p.content.length > 80 ? `${p.content.slice(0, 80)}…` : p.content,
            section: 'posts' as const,
            keywords: '',
            sublabel: p.user?.name ?? undefined,
            href: `/u/${p.user?.handle ?? '_'}/post/${p.id}`,
          })),
        });
      } catch {
        // Aborted or offline — local results still render.
      }
    }, 200);
    return () => {
      ctrl.abort();
      clearTimeout(timer);
    };
  }, [query, open, t]);

  const go = useCallback(
    (href: string, external?: boolean) => {
      setOpen(false);
      if (external || /^https?:\/\//.test(href)) {
        window.open(href, '_blank', 'noopener,noreferrer');
      } else {
        navigate({ to: href });
      }
    },
    [navigate]
  );

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [];

    // Quick actions first — they win ties in the default (empty-query) view.
    list.push({
      id: 'action-compose',
      label: t('palette-new-post', { defaultValue: 'New post' }),
      section: 'actions',
      keywords: 'compose write rmhark tweet share',
      icon: PenSquare,
      requiresAuth: true,
      run: () => {
        setOpen(false);
        setComposeOpen(true);
      },
    });
    list.push({
      id: 'action-checkin',
      label: t('palette-daily-checkin', { defaultValue: 'Daily check-in & streaks' }),
      section: 'actions',
      keywords: 'streak coins claim daily reward',
      icon: Flame,
      requiresAuth: true,
      run: () => go('/achievements'),
    });
    list.push({
      id: 'action-shortcuts',
      label: t('palette-shortcuts', { defaultValue: 'Keyboard shortcuts' }),
      section: 'actions',
      keywords: 'keyboard shortcuts hotkeys keys help',
      icon: Keyboard,
      run: () => {
        setOpen(false);
        // Literal event name (mirrors SHORTCUTS_HELP_EVENT in KeyboardShortcuts)
        // to avoid a palette ⇄ shortcuts module cycle.
        window.dispatchEvent(new Event('rmh:shortcuts-help'));
      },
    });
    if (userHandle) {
      list.push({
        id: 'action-profile',
        label: t('palette-my-profile', { defaultValue: 'My profile' }),
        section: 'actions',
        keywords: 'me account profile page',
        icon: User,
        run: () => go(`/profile/${userHandle}`),
      });
    }
    if (signedIn) {
      list.push({
        id: 'action-signout',
        label: t('palette-sign-out', { defaultValue: 'Sign out' }),
        section: 'actions',
        keywords: 'logout log out leave',
        icon: LogOut,
        run: async () => {
          setOpen(false);
          await authClient.signOut();
          window.location.href = '/';
        },
      });
    } else {
      list.push({
        id: 'action-signin',
        label: t('palette-sign-in', { defaultValue: 'Sign in' }),
        section: 'actions',
        keywords: 'login log in register sign up account',
        icon: User,
        run: () => go('/login'),
      });
    }

    for (const p of PAGES) {
      if (p.requiresAuth && !signedIn) continue;
      list.push({ ...p, section: 'pages' });
    }

    for (const g of games) {
      if (g.unlisted) continue;
      list.push({
        id: `game-${g.id}`,
        label: g.title,
        section: 'games',
        keywords: `${g.tags.join(' ')} ${g.description}`,
        icon: Gamepad2,
        href: g.href,
      });
    }

    for (const a of apps) {
      if (a.hidden || a.unlisted) continue;
      list.push({
        id: `app-${a.id}`,
        label: a.title,
        section: 'apps',
        keywords: `${a.tags.join(' ')} ${a.description}`,
        icon: LayoutGrid,
        href: a.href,
        external: !a.href.startsWith('/'),
      });
    }

    for (const s of SITE_STYLES) {
      list.push({
        id: `theme-${s.id}`,
        label: t('palette-theme', { defaultValue: 'Theme: {{name}}', name: s.label }),
        section: 'themes',
        keywords: `theme style appearance ${s.group} ${s.label}`,
        emoji: s.icon,
        run: () => {
          setStyle(s.id as SiteStyle);
          setOpen(false);
        },
      });
    }

    return list;
  }, [t, signedIn, userHandle, go, setStyle]);

  const fuse = useMemo(
    () =>
      new Fuse(commands, {
        keys: [
          { name: 'label', weight: 0.7 },
          { name: 'keywords', weight: 0.3 },
        ],
        threshold: 0.35,
        ignoreLocation: true,
      }),
    [commands]
  );

  const results = useMemo(() => {
    if (!query.trim()) {
      // Default view: actions + pages, in catalog order (themes/games only when searched).
      return commands.filter((c) => c.section === 'actions' || c.section === 'pages');
    }
    return fuse.search(query.trim()).map((r) => r.item);
  }, [query, commands, fuse]);

  // Local fuzzy results + server search results (people/posts sections).
  const combined = useMemo(() => {
    if (!query.trim()) return results;
    return [...results, ...remote.people, ...remote.posts];
  }, [results, remote, query]);

  // Group results by section, preserving fuzzy rank within each group.
  const grouped = useMemo(() => {
    const bySection = new Map<Section, Command[]>();
    for (const c of combined) {
      const arr = bySection.get(c.section) ?? [];
      arr.push(c);
      bySection.set(c.section, arr);
    }
    return SECTION_ORDER.filter((s) => bySection.has(s)).map((s) => ({
      section: s,
      items: bySection.get(s)!,
    }));
  }, [combined]);

  const flat = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

  // Keep the active row valid and visible as results change.
  useEffect(() => {
    setActiveIndex((i) => Math.min(i, Math.max(0, flat.length - 1)));
  }, [flat.length]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const runCommand = useCallback(
    (cmd: Command) => {
      if (cmd.run) void cmd.run();
      else if (cmd.href) go(cmd.href, cmd.external);
    },
    [go]
  );

  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flat.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = flat[activeIndex];
      if (cmd) runCommand(cmd);
    }
  };

  return (
    <>
    {composeOpen && (
      <Suspense fallback={null}>
        <ComposeModal open={composeOpen} onClose={() => setComposeOpen(false)} />
      </Suspense>
    )}
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-[12dvh] z-[91] w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-site border border-site-border bg-site-surface shadow-2xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">
            {t('palette-title', { defaultValue: 'Command palette' })}
          </DialogPrimitive.Title>
          <div className="flex items-center gap-2 border-b border-site-border px-4">
            <Search className="h-4 w-4 shrink-0 text-site-text-dim" aria-hidden />
            <input
              ref={inputRef}
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={onInputKeyDown}
              role="combobox"
              aria-expanded="true"
              aria-controls="command-palette-list"
              aria-activedescendant={flat[activeIndex]?.id}
              aria-label={t('palette-input-label', { defaultValue: 'Search pages, games, apps, and actions' })}
              placeholder={t('palette-placeholder', { defaultValue: 'Search pages, people, posts, games…' })}
              className="w-full bg-transparent py-3.5 text-sm text-site-text placeholder:text-site-text-dim focus:outline-none"
            />
            <kbd className="hidden shrink-0 rounded border border-site-border px-1.5 py-0.5 text-[10px] text-site-text-dim sm:block">
              esc
            </kbd>
          </div>
          <div
            ref={listRef}
            id="command-palette-list"
            role="listbox"
            aria-label={t('palette-title', { defaultValue: 'Command palette' })}
            className="max-h-[50dvh] overflow-y-auto p-2"
          >
            {flat.length === 0 && (
              <p className="px-3 py-8 text-center text-sm text-site-text-dim">
                {t('palette-no-results', { defaultValue: 'No results. Try a different search.' })}
              </p>
            )}
            {grouped.map((group) => (
              <div key={group.section} className="mb-1">
                <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-site-text-dim">
                  {t(SECTION_LABELS[group.section].key, { defaultValue: SECTION_LABELS[group.section].fallback })}
                </p>
                {group.items.map((cmd) => {
                  const index = flat.indexOf(cmd);
                  const active = index === activeIndex;
                  const Icon = cmd.icon;
                  return (
                    <button
                      key={cmd.id}
                      id={cmd.id}
                      data-index={index}
                      role="option"
                      aria-selected={active}
                      onMouseMove={() => setActiveIndex(index)}
                      onClick={() => runCommand(cmd)}
                      className={`flex w-full items-center gap-3 rounded-site-sm px-3 py-2 text-left text-sm transition-colors ${
                        active
                          ? 'bg-site-accent/15 text-site-text'
                          : 'text-site-text-muted hover:bg-site-surface-hover'
                      }`}
                    >
                      {cmd.section === 'people' ? (
                        <UserAvatar
                          src={cmd.image}
                          alt=""
                          size={20}
                          fallbackName={cmd.label}
                          className="shrink-0"
                        />
                      ) : Icon ? (
                        <Icon className="h-4 w-4 shrink-0 text-site-text-dim" aria-hidden />
                      ) : cmd.emoji ? (
                        <span className="w-4 shrink-0 text-center text-sm leading-none" aria-hidden>
                          {cmd.emoji}
                        </span>
                      ) : null}
                      <span className="min-w-0 flex-1 truncate">
                        {cmd.label}
                        {cmd.sublabel && (
                          <span className="ml-1.5 text-xs text-site-text-dim">{cmd.sublabel}</span>
                        )}
                      </span>
                      {active && (
                        <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-site-text-dim" aria-hidden />
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
    </>
  );
}
