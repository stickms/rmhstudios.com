'use client';

/**
 * The top bar's quick panels — a cheap preview behind every utility control.
 *
 * Each control (search, notifications, messages, you) opens a small panel with
 * the first few results and a footer link to the full page, so the common case
 * is a glance rather than a navigation. Every panel fetches only while it is
 * open, once per open, and renders inside {@link QuickPanel}, which owns the
 * anchoring, the viewport clamp, Escape/outside-press dismissal and focus.
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  Bell,
  LogOut,
  MessageSquare,
  Search,
  Settings,
  User as UserIcon,
  Wallet,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { authClient } from '@/lib/auth-client';
import { useResolvedUser, useSession } from '@/components/Providers';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { QuickPanel, QuickPanelMoreIcon, QuickPanelNote, QuickPanelSkeleton } from './QuickPanel';
import { useReservedRows } from '@/hooks/useReservedRows';
import { AVATAR_KINDS, KIND_ICON, useKindLabel } from '@/components/search/SearchHitRow';
import type { SearchHit, SearchResponse } from '@/lib/search/types';

/**
 * Rows every list preview caps itself at — the notifications request asks for
 * this many and the messages panel slices to it. It is also what the loading
 * skeleton reserves on a first open, which only works because the two are the
 * same number: a cap that drifted from the reservation would put the jump back.
 */
const PREVIEW_LIMIT = 6;

interface PanelProps {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
}

/** Relative time, compact ("3m", "2h", "5d"). */
function ago(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/**
 * Fetch `url` while `open`, exactly once per opening, aborting if the panel is
 * dismissed mid-flight. Returns `null` until the first response settles.
 */
function usePanelData<T>(open: boolean, url: string | null, enabled = true) {
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open || !url || !enabled) return;
    const controller = new AbortController();
    setFailed(false);
    (async () => {
      try {
        const res = await fetch(url, { credentials: 'include', signal: controller.signal });
        if (!res.ok) throw new Error(String(res.status));
        setData((await res.json()) as T);
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      }
    })();
    return () => controller.abort();
  }, [open, url, enabled]);

  return { data, failed };
}

/* ── Search ──────────────────────────────────────────────────────────────── */

/** Rows the preview shows — the strongest of the ranked cross-kind list. */
const SEARCH_PREVIEW = 6;

/**
 * The top bar's search preview. It asks `/api/search` the same question the
 * Explore page does (`tab=top`, the ranked cross-kind list) and renders it with
 * the same per-kind vocabulary (`KIND_ICON`, `useKindLabel`), so the two
 * surfaces cannot disagree about what a query finds.
 *
 * They used to. This panel asked the legacy `type=all` shape and rendered only
 * its `people` and `posts` arrays — so searching a game, an app or a page by its
 * exact name here said "No matches yet" while Explore listed it first. And it
 * told signed-out visitors to sign in before searching at all, when the
 * catalog half of search needs no account (`/api/search` answers it
 * anonymously now).
 */
export function SearchPanel({ open, onClose, anchorRef }: PanelProps) {
  const { t } = useTranslation('feed');
  const kindLabel = useKindLabel();
  const navigate = useNavigate();
  const { data: session } = useSession();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  // Debounce so typing doesn't fire a DB-backed search per keystroke.
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(id);
  }, [query]);

  // Reset between openings so a stale query never greets the next open.
  useEffect(() => {
    if (!open) {
      setQuery('');
      setDebounced('');
    }
  }, [open]);

  const ready = debounced.length >= 2;
  const { data, failed } = usePanelData<Pick<SearchResponse, 'top'>>(
    open,
    ready ? `/api/search?q=${encodeURIComponent(debounced)}&tab=top` : null,
  );

  const submit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const q = query.trim();
      if (!q) return;
      onClose();
      void navigate({ to: '/explore', search: { q, tab: 'top' } });
    },
    [query, navigate, onClose],
  );

  // A glance, so only what search is sure of when it is sure of anything —
  // Explore files the rest under "Less certain matches", which a six-row
  // preview has no room to label. With no confident hit, the best guesses show.
  const top = data?.top ?? [];
  const confident = top.filter((hit) => hit.confidence !== 'low');
  const hits = (confident.length > 0 ? confident : top).slice(0, SEARCH_PREVIEW);

  return (
    <QuickPanel
      open={open}
      onClose={onClose}
      title={t('search', { defaultValue: 'Search' })}
      icon={Search}
      anchorRef={anchorRef}
      more={
        <Link
          to="/explore"
          search={{ q: query.trim(), tab: 'top' }}
          className="rad-panel__more"
          onClick={onClose}
        >
          <span>{t('search-see-all', { defaultValue: 'Open full search' })}</span>
          <QuickPanelMoreIcon />
        </Link>
      }
    >
      <form className="rad-panel__search" onSubmit={submit} role="search">
        <Search aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('search-placeholder-universal', {
            defaultValue: 'Search anything — people, posts, games, writing…',
          })}
          aria-label={t('search', { defaultValue: 'Search' })}
          autoComplete="off"
        />
      </form>

      {debounced.length < 2 ? (
        <QuickPanelNote>
          {t('search-hint', { defaultValue: 'Type at least two characters.' })}
        </QuickPanelNote>
      ) : failed ? (
        <QuickPanelNote>
          {t('search-failed', { defaultValue: 'Search is unavailable right now.' })}
        </QuickPanelNote>
      ) : !data ? (
        <QuickPanelNote>{t('loading', { defaultValue: 'Loading…' })}</QuickPanelNote>
      ) : hits.length === 0 ? (
        <QuickPanelNote>
          {session
            ? t('search-no-matches', { defaultValue: 'No matches yet.' })
            : t('search-no-matches-signed-out', {
                defaultValue: 'No games, apps or pages match. Sign in to search people and posts.',
              })}
        </QuickPanelNote>
      ) : (
        <section className="rad-panel__group">
          {hits.map((hit) => (
            <SearchPreviewRow
              key={hit.key}
              hit={hit}
              kindLabel={kindLabel(hit.kind)}
              onNavigate={onClose}
            />
          ))}
        </section>
      )}
    </QuickPanel>
  );
}

/** One preview row: the hit's face or kind glyph, its title, and what it is. */
function SearchPreviewRow({
  hit,
  kindLabel,
  onNavigate,
}: {
  hit: SearchHit;
  kindLabel: string;
  onNavigate: () => void;
}) {
  const Icon = KIND_ICON[hit.kind];
  const body = (
    <>
      {AVATAR_KINDS.has(hit.kind) ? (
        <UserAvatar src={hit.image ?? undefined} alt="" size={28} fallbackName={hit.title || 'U'} />
      ) : (
        <Icon aria-hidden />
      )}
      <span className="rad-panel__row-main">
        <strong>{hit.title}</strong>
        <small>{hit.subtitle ? `${kindLabel} · ${hit.subtitle}` : kindLabel}</small>
      </span>
    </>
  );
  const external = Boolean(hit.meta?.external) || /^https?:\/\//.test(hit.href);
  return external ? (
    <a
      href={hit.href}
      target="_blank"
      rel="noopener noreferrer"
      className="rad-panel__row"
      onClick={onNavigate}
    >
      {body}
    </a>
  ) : (
    <Link to={hit.href as string} className="rad-panel__row" onClick={onNavigate}>
      {body}
    </Link>
  );
}

/* ── Notifications ───────────────────────────────────────────────────────── */

interface NotificationRow {
  id: string;
  preview: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
  actor: { id: string; name: string | null; handle: string | null; image: string | null } | null;
}

export function NotificationsPanel({ open, onClose, anchorRef }: PanelProps) {
  const { t } = useTranslation('feed');
  const { data, failed } = usePanelData<{ items: NotificationRow[] }>(
    open,
    `/api/notifications?limit=${PREVIEW_LIMIT}`,
  );
  const items = data?.items ?? [];
  // Reserve the shape of the list that is coming, so the panel animates to its
  // real height instead of to the height of the word "Loading…" and then
  // jumping. `PREVIEW_LIMIT` is the same cap the request above asks for.
  const reserved = useReservedRows(
    'quick-notifications',
    data ? items.length : null,
    PREVIEW_LIMIT,
  );

  return (
    <QuickPanel
      open={open}
      onClose={onClose}
      title={t('notifications', { defaultValue: 'Notifications' })}
      icon={Bell}
      anchorRef={anchorRef}
      more={
        // Through to the Inbox's Notifications tab — the one full notifications
        // surface. (`/notifications` redirects there too, which is what the
        // per-row fallback below relies on.)
        <Link
          to="/messages"
          search={{ tab: 'notifications' }}
          className="rad-panel__more"
          onClick={onClose}
        >
          <span>{t('notifications-see-all', { defaultValue: 'All notifications' })}</span>
          <QuickPanelMoreIcon />
        </Link>
      }
    >
      {failed ? (
        <QuickPanelNote>
          {t('panel-failed', { defaultValue: "Couldn't load that just now." })}
        </QuickPanelNote>
      ) : !data ? (
        <QuickPanelSkeleton rows={reserved} label={t('loading', { defaultValue: 'Loading…' })} />
      ) : items.length === 0 ? (
        <QuickPanelNote>
          {t('notifications-empty', { defaultValue: 'Nothing new right now.' })}
        </QuickPanelNote>
      ) : (
        items.map((n) => (
          <Link
            key={n.id}
            to={n.link || '/notifications'}
            className={'rad-panel__row' + (n.read ? '' : ' is-unread')}
            onClick={onClose}
          >
            <UserAvatar
              src={n.actor?.image ?? undefined}
              alt={n.actor?.name || 'RMH'}
              size={28}
              fallbackName={n.actor?.name || 'RMH'}
            />
            <span className="rad-panel__row-main">
              <strong>{n.actor?.name || n.actor?.handle || 'RMH Studios'}</strong>
              <small>{n.preview}</small>
            </span>
            <time dateTime={n.createdAt}>{ago(n.createdAt)}</time>
          </Link>
        ))
      )}
    </QuickPanel>
  );
}

/* ── Messages ────────────────────────────────────────────────────────────── */

interface ConversationRow {
  id: string;
  otherUser: { id: string; name: string | null; image: string | null; username: string | null };
  lastMessage: { content: string | null; createdAt: string } | null;
  unreadCount?: number;
}

export function MessagesPanel({ open, onClose, anchorRef }: PanelProps) {
  const { t } = useTranslation('feed');
  const { data, failed } = usePanelData<{ conversations: ConversationRow[] }>(
    open,
    '/api/messages',
  );
  const items = data?.conversations?.slice(0, PREVIEW_LIMIT) ?? [];
  // As above: the panel opens at the size of the list it is about to show.
  const reserved = useReservedRows('quick-messages', data ? items.length : null, PREVIEW_LIMIT);

  return (
    <QuickPanel
      open={open}
      onClose={onClose}
      title={t('messages', { defaultValue: 'Messages' })}
      icon={MessageSquare}
      anchorRef={anchorRef}
      more={
        <Link to="/messages" className="rad-panel__more" onClick={onClose}>
          <span>{t('messages-see-all', { defaultValue: 'Open inbox' })}</span>
          <QuickPanelMoreIcon />
        </Link>
      }
    >
      {failed ? (
        <QuickPanelNote>
          {t('panel-failed', { defaultValue: "Couldn't load that just now." })}
        </QuickPanelNote>
      ) : !data ? (
        <QuickPanelSkeleton rows={reserved} label={t('loading', { defaultValue: 'Loading…' })} />
      ) : items.length === 0 ? (
        <QuickPanelNote>
          {t('messages-empty', { defaultValue: 'No conversations yet.' })}
        </QuickPanelNote>
      ) : (
        items.map((c) => (
          <Link
            key={c.id}
            to="/messages"
            className={'rad-panel__row' + (c.unreadCount ? ' is-unread' : '')}
            onClick={onClose}
          >
            <UserAvatar
              src={c.otherUser.image ?? undefined}
              alt={c.otherUser.name || 'User'}
              size={28}
              fallbackName={c.otherUser.name ?? undefined}
            />
            <span className="rad-panel__row-main">
              <strong>{c.otherUser.name || c.otherUser.username}</strong>
              <small>{c.lastMessage?.content || ''}</small>
            </span>
            {c.lastMessage && (
              <time dateTime={c.lastMessage.createdAt}>{ago(c.lastMessage.createdAt)}</time>
            )}
          </Link>
        ))
      )}
    </QuickPanel>
  );
}

/* ── You ─────────────────────────────────────────────────────────────────── */

export function ProfilePanel({ open, onClose, anchorRef }: PanelProps) {
  const { t } = useTranslation('feed');
  const navigate = useNavigate();
  const { data: session } = useSession();
  const { resolved } = useResolvedUser();
  const user = session?.user as { id: string; handle?: string | null } | undefined;
  const signingOut = useRef(false);

  const profileHref = user ? `/u/${user.handle || user.id}` : '/login';
  const name = resolved?.name || session?.user?.name || 'You';

  const signOut = useCallback(async () => {
    if (signingOut.current) return;
    signingOut.current = true;
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          onClose();
          void navigate({ to: '/' });
          window.location.reload();
        },
      },
    });
    signingOut.current = false;
  }, [navigate, onClose]);

  return (
    <QuickPanel
      open={open}
      onClose={onClose}
      title={t('profile', { defaultValue: 'Profile' })}
      icon={UserIcon}
      anchorRef={anchorRef}
      more={
        <Link to={profileHref} className="rad-panel__more" onClick={onClose}>
          <span>{t('view-full-profile', { defaultValue: 'View full profile' })}</span>
          <QuickPanelMoreIcon />
        </Link>
      }
    >
      <Link to={profileHref} className="rad-panel__identity" onClick={onClose}>
        <UserAvatar
          src={resolved?.image || session?.user?.image || undefined}
          alt={name}
          size={44}
          fallbackName={name}
        />
        <span className="rad-panel__row-main">
          <strong>{name}</strong>
          {user?.handle && <small>@{user.handle}</small>}
        </span>
      </Link>

      <div className="rad-panel__links">
        <Link to={profileHref} className="rad-panel__row" onClick={onClose}>
          <UserIcon aria-hidden />
          <span className="rad-panel__row-main">
            <strong>{t('profile', { defaultValue: 'Profile' })}</strong>
          </span>
        </Link>
        <Link to="/predictions" className="rad-panel__row" onClick={onClose}>
          <Wallet aria-hidden />
          <span className="rad-panel__row-main">
            <strong>{t('nav-wallet', { defaultValue: 'Wallet' })}</strong>
          </span>
        </Link>
        <Link to="/settings" className="rad-panel__row" onClick={onClose}>
          <Settings aria-hidden />
          <span className="rad-panel__row-main">
            <strong>{t('settings', { defaultValue: 'Settings' })}</strong>
          </span>
        </Link>
        <button type="button" className="rad-panel__row" onClick={signOut}>
          <LogOut aria-hidden />
          <span className="rad-panel__row-main">
            <strong>{t('sign-out', { defaultValue: 'Sign out' })}</strong>
          </span>
        </button>
      </div>
    </QuickPanel>
  );
}
