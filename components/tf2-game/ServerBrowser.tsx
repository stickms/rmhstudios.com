/**
 * The TF2 server browser: one list of dedicated rooms (matches on the games
 * hub) and peer-to-peer rooms (a player's browser hosting, marked "Hosted by
 * <name> (P2P)"), with the columns of the game's own browser — name, map,
 * mode, players / max (+ bots), ping, host, type — sortable by any of them,
 * filters (map, mode, type, not full, has humans, hide empty) and a search;
 * auto-refresh every 15 s plus Refresh; a details pane (the roster with
 * classes and scores, the round and its time left) with Join and Join as
 * spectator; Quick Play for a mode or map; Favorites and Recent servers on
 * this device; and join by code. Logic: lib/tf2-game/client/server-browser.ts.
 *
 * Browsing is open to everyone; joining needs an account (the hub refuses
 * otherwise), so a visitor's Join is a sign-in link that comes back here.
 * Ping is the hub's round trip for dedicated rooms; a P2P host's is unknown
 * until connected (the browser never sees addresses), so it shows "—".
 *
 * A list read top to bottom, so it scrolls the document (components/CLAUDE.md
 * §12.1); rows are buttons, so keyboards work, and a gamepad moves through
 * them (use-lobby-gamepad.ts).
 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { ArrowDown, ArrowUp, Eye, Globe, KeyRound, LogIn, RefreshCw, Search, Share2, Server, Star, Users, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Btn, EmptyNote, Field, IconBtn, Pill, SelectField, TextField, Toggle } from '@/components/tf2-hud/ui';
import { TfTabs } from '@/components/tf2-hud/TfTabs';
import { useLobbyLink } from '@/hooks/useLobbyLink';
import { lobbyReturnPath } from '@/lib/lobby-link';
import { cn } from '@/lib/utils';
import { TF2_MAPS, TF2_MODES, type Tf2Mode } from '@/lib/tf2-game/data/maps';
import { TF2_LIMITS, TF2_ROOM_CODE_RE, type RoomDetailsPayload, type RoomListEntry } from '@/lib/tf2-game/net/events';
import type { Tf2Session } from '@/lib/tf2-game/client/tf2-client';
import {
  DEFAULT_FILTERS,
  FAVORITES_KEY,
  RECENT_KEY,
  filterRooms,
  forget,
  isFull,
  quickPlayPick,
  readSaved,
  remember,
  roomPing,
  savedFrom,
  sortRooms,
  writeSaved,
  type BrowserFilters,
  type SavedServer,
  type SortDir,
  type SortKey,
} from '@/lib/tf2-game/client/server-browser';
import { useClassNames, useTeamNames } from './strings';
import { useLobbyGamepad } from './use-lobby-gamepad';

type Net = typeof import('@/lib/tf2-game/net/client');
type View = 'all' | 'favorites' | 'recent';

const REFRESH_MS = 15_000;

function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function ServerBrowser({
  signedIn,
  userId,
  invite,
  onStart,
  onStatus,
}: {
  signedIn: boolean;
  /** The signed-in account (a change re-authenticates the hub connection). */
  userId: string | null;
  invite: string | null;
  onStart: (session: Tf2Session) => void;
  /** The hub connection's state, for the host card's button. */
  onStatus?: (status: string) => void;
}) {
  const { t } = useTranslation('c-tf2-game');
  const classNames = useClassNames();
  const teamNames = useTeamNames();
  const root = useRef<HTMLDivElement>(null);
  useLobbyGamepad(root);

  const netRef = useRef<Net | null>(null);
  const [status, setStatus] = useState('connecting');
  const [rooms, setRooms] = useState<RoomListEntry[] | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hubRtt, setHubRtt] = useState<number | null>(null);
  const [view, setView] = useState<View>('all');
  const [filters, setFilters] = useState<BrowserFilters>(DEFAULT_FILTERS);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'players', dir: 'desc' });
  const [selected, setSelected] = useState<string | null>(null);
  const [details, setDetails] = useState<RoomDetailsPayload | null>(null);
  const [favorites, setFavorites] = useState<SavedServer[]>([]);
  const [recent, setRecent] = useState<SavedServer[]>([]);
  const [code, setCode] = useState('');
  const [quick, setQuick] = useState<{ mode: Tf2Mode | ''; map: string }>({ mode: '', map: '' });
  const [quickMiss, setQuickMiss] = useState(false);
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selected;
  const offsetRef = useRef(0);
  offsetRef.current = offset;

  const mapTitle = useMemo(() => {
    const titles = new Map(TF2_MAPS.map((m) => [m.name, m.title]));
    return (name: string) => titles.get(name) ?? name;
  }, []);
  const modeLabel = useCallback(
    (m: string) =>
      ({
        ctf: t('mode_ctf', { defaultValue: 'Capture the Flag' }),
        cp: t('mode_cp', { defaultValue: 'Control Points' }),
        cp_ad: t('mode_cp_ad', { defaultValue: 'Attack / Defend' }),
        koth: t('mode_koth', { defaultValue: 'King of the Hill' }),
        pl: t('mode_pl', { defaultValue: 'Payload' }),
        arena: t('mode_arena', { defaultValue: 'Arena' }),
      })[m] ?? m,
    [t],
  );

  useEffect(() => {
    setFavorites(readSaved(FAVORITES_KEY));
    setRecent(readSaved(RECENT_KEY));
  }, []);

  // The hub: browse (anyone may), measure its round trip, refresh on a timer.
  useEffect(() => {
    let alive = true;
    let remove: (() => void) | null = null;
    void import('@/lib/tf2-game/net/client').then(async (m) => {
      if (!alive) return;
      netRef.current = m;
      try {
        // Beside the game's own callbacks, never instead of them: this list stays
        // mounted under a running match (an invite link starts one at once).
        remove = m.addTf2Handlers({
          onStatus: (s) => {
            if (!alive) return;
            setStatus(s);
            onStatus?.(s);
            if (s === 'connected') {
              m.tf2.listRooms(offsetRef.current);
              void m.tf2.measureHubRtt().then((rtt) => alive && rtt !== null && setHubRtt(rtt));
            }
          },
          onRooms: (page) => {
            if (!alive) return;
            setRooms(page.rooms);
            setTotal(page.total);
          },
          onRoomDetails: (d) => alive && d.code === selectedRef.current && setDetails(d),
        });
        await m.connectTf2();
        if (alive && m.getTf2Socket()?.connected) {
          // Already connected by someone else (a match that just ended): no status change will come.
          setStatus('connected');
          onStatus?.('connected');
        }
        m.tf2.listRooms(offsetRef.current);
      } catch {
        // No games hub configured (a local build without VITE_SOCKET_URL): offline play still works.
        if (alive) {
          setStatus('unavailable');
          onStatus?.('unavailable');
          setRooms([]);
        }
      }
    });
    return () => {
      alive = false;
      remove?.();
    };
  }, [onStatus]);

  // Signing in after the hub connected: a new handshake carries the session.
  const lastUser = useRef(userId);
  useEffect(() => {
    if (lastUser.current === userId) return;
    lastUser.current = userId;
    netRef.current?.reauthenticateTf2();
  }, [userId]);

  const refresh = useCallback(() => {
    const net = netRef.current;
    if (!net) return;
    // A match that ended tore the connection down: open a new one (it reports its status here).
    if (!net.getTf2Socket()) {
      void net.connectTf2().catch(() => {});
      return;
    }
    net.tf2.listRooms(offsetRef.current);
    if (selectedRef.current) net.tf2.roomDetails(selectedRef.current);
    void net.tf2.measureHubRtt().then((rtt) => rtt !== null && setHubRtt(rtt));
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    setDetails(null);
    if (selected) netRef.current?.tf2.roomDetails(selected);
  }, [selected]);

  useEffect(() => {
    netRef.current?.tf2.listRooms(offset);
  }, [offset]);

  const live = useMemo(() => new Map((rooms ?? []).map((r) => [r.code, r])), [rooms]);
  const shown = useMemo(() => {
    if (!rooms) return [];
    if (view !== 'all') return [];
    return sortRooms(filterRooms(rooms, filters, mapTitle), sort.key, sort.dir, hubRtt, mapTitle);
  }, [rooms, view, filters, sort, hubRtt, mapTitle]);

  const join = (r: { code: string; kind: RoomListEntry['kind'] }, spectate = false, saved?: SavedServer, password?: string) => {
    if (!signedIn) return;
    const entry = live.get(r.code);
    const next = remember(recent, entry ? savedFrom(entry) : { ...(saved ?? { name: r.code, map: '', kind: r.kind, code: r.code }), at: Date.now() });
    setRecent(next);
    writeSaved(RECENT_KEY, next);
    // The spectator choice and the room's password ride the join request itself.
    const pw = password ? { password } : {};
    onStart(r.kind === 'p2p' ? { kind: 'p2p-join', code: r.code, spectate, ...pw } : { kind: 'online-join', code: r.code, spectate, ...pw });
  };

  const toggleFavorite = (r: RoomListEntry | SavedServer) => {
    const has = favorites.some((f) => f.code === r.code);
    const next = has ? forget(favorites, r.code) : remember(favorites, 'state' in r ? savedFrom(r) : { ...r, at: Date.now() });
    setFavorites(next);
    writeSaved(FAVORITES_KEY, next);
  };

  const quickPlay = () => {
    const pick = quickPlayPick(rooms ?? [], quick, hubRtt);
    if (!pick) {
      setQuickMiss(true);
      return;
    }
    setQuickMiss(false);
    toast(t('browser_quick_joining', { defaultValue: 'Joining {{name}}', name: pick.name || pick.code }));
    join(pick);
  };

  const codeValid = TF2_ROOM_CODE_RE.test(code.trim().toUpperCase());
  const signInLink = (label: ReactNode) => (
    <Link
      to="/login"
      search={{ callbackURL: lobbyReturnPath('/tf2/play', invite) }}
      data-menu-item
      className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-(--app-radius-sm) border border-(--app-border-bright) px-3 text-xs font-semibold text-(--app-text) hover:bg-(--app-surface-hover) sm:pointer-fine:min-h-8"
    >
      <LogIn className="size-3.5" aria-hidden />
      {label}
    </Link>
  );

  const sortHeader = (key: SortKey, label: string, className?: string) => {
    const active = sort.key === key;
    return (
      <th scope="col" className={cn('px-2 py-1.5 text-start font-semibold', className)} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <button
          type="button"
          className="inline-flex min-h-8 items-center gap-1 uppercase tracking-wider text-(--app-text-dim) hover:text-(--app-text)"
          onClick={() => setSort({ key, dir: active && sort.dir === 'desc' ? 'asc' : active ? 'desc' : key === 'players' ? 'desc' : 'asc' })}
        >
          {label}
          {active ? sort.dir === 'asc' ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden /> : null}
        </button>
      </th>
    );
  };

  const kindLabel = (r: RoomListEntry) =>
    r.kind === 'p2p' ? t('browser_kind_p2p', { defaultValue: 'P2P' }) : t('browser_kind_dedicated', { defaultValue: 'Dedicated' });
  const hostLabel = (r: RoomListEntry) =>
    r.kind === 'p2p' && r.host ? t('browser_hosted_by', { defaultValue: 'Hosted by {{name}} (P2P)', name: r.host }) : '—';
  const pingLabel = (r: RoomListEntry) => {
    const p = roomPing(r, hubRtt);
    return p === null ? '—' : t('browser_ping_ms', { defaultValue: '{{ms}} ms', ms: p });
  };
  const playersLabel = (r: RoomListEntry) =>
    r.bots > 0
      ? t('browser_players_bots', { defaultValue: '{{n}}/{{max}} (+{{bots}} bots)', n: r.players, max: r.maxPlayers, bots: r.bots })
      : t('play_room_players', { defaultValue: '{{n}}/{{max}}', n: r.players, max: r.maxPlayers });

  const card = 'rounded-(--app-radius) border border-(--app-border) bg-(--app-bg-subtle) p-5';
  const savedList = view === 'favorites' ? favorites : recent;
  const selectedRoom = selected ? live.get(selected) ?? details?.room ?? null : null;

  return (
    <section ref={root} className={cn(card, 'lg:col-span-2')} aria-labelledby="tf2-online-title">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Globe className="size-5 text-(--app-accent-text)" aria-hidden />
        <h2 id="tf2-online-title" className="tf2hud-title text-2xl">
          {t('play_online_title', { defaultValue: 'Servers' })}
        </h2>
        <span className="ms-auto text-xs text-(--app-text-dim)" role="status">
          {status === 'connected'
            ? hubRtt !== null
              ? t('browser_status_rtt', { defaultValue: 'Connected · {{ms}} ms', ms: Math.round(hubRtt) })
              : t('play_status_online', { defaultValue: 'Connected' })
            : status === 'connecting'
              ? t('play_status_connecting', { defaultValue: 'Connecting…' })
              : t('play_status_offline', { defaultValue: 'Hub unavailable — retrying' })}
        </span>
        <Btn size="xs" variant="ghost" icon={RefreshCw} onClick={refresh} disabled={status !== 'connected'} data-menu-item>
          {t('play_refresh', { defaultValue: 'Refresh' })}
        </Btn>
      </div>

      {/* Quick Play: the best open room for a mode or map, else an offer to host or play offline. */}
      <div className="mb-4 flex flex-wrap items-end gap-2 rounded-(--app-radius-sm) border border-(--app-border) bg-(--app-bg) p-3">
        <Field label={t('browser_quick_mode', { defaultValue: 'Mode' })} className="min-w-36 flex-1">
          <SelectField value={quick.mode} onChange={(e) => setQuick({ ...quick, mode: e.target.value as Tf2Mode | '' })}>
            <option value="">{t('browser_any', { defaultValue: 'Any' })}</option>
            {TF2_MODES.filter((m) => TF2_MAPS.some((x) => x.mode === m)).map((m) => (
              <option key={m} value={m}>
                {modeLabel(m)}
              </option>
            ))}
          </SelectField>
        </Field>
        <Field label={t('play_map', { defaultValue: 'Map' })} className="min-w-36 flex-1">
          <SelectField value={quick.map} onChange={(e) => setQuick({ ...quick, map: e.target.value })}>
            <option value="">{t('browser_any', { defaultValue: 'Any' })}</option>
            {TF2_MAPS.filter((m) => !quick.mode || m.mode === quick.mode).map((m) => (
              <option key={m.name} value={m.name}>
                {m.title}
              </option>
            ))}
          </SelectField>
        </Field>
        {signedIn ? (
          <Btn variant="primary" size="sm" icon={Zap} onClick={quickPlay} disabled={status !== 'connected'} data-menu-item>
            {t('browser_quick_play', { defaultValue: 'Quick Play' })}
          </Btn>
        ) : (
          signInLink(t('browser_quick_sign_in', { defaultValue: 'Sign in for Quick Play' }))
        )}
        {quickMiss ? (
          <p className="w-full text-xs text-(--app-text-muted)" role="status">
            {t('browser_quick_none', {
              defaultValue: 'No open server matches. Host one above (peer-to-peer or dedicated), or play offline against bots.',
            })}
          </p>
        ) : null}
      </div>

      <TfTabs
        className="mb-3"
        aria-label={t('browser_views', { defaultValue: 'Server lists' })}
        value={view}
        onChange={(id) => setView(id as View)}
        tabs={[
          { id: 'all', label: t('browser_view_all', { defaultValue: 'Internet' }), icon: Globe, count: total },
          { id: 'favorites', label: t('browser_view_favorites', { defaultValue: 'Favorites' }), icon: Star, count: favorites.length },
          { id: 'recent', label: t('browser_view_recent', { defaultValue: 'Recent' }), count: recent.length },
        ]}
      />

      {view === 'all' ? (
        <>
          <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t('browser_search', { defaultValue: 'Search' })}>
              <div className="relative">
                <Search className="pointer-events-none absolute start-2 top-1/2 size-3.5 -translate-y-1/2 text-(--app-text-dim)" aria-hidden />
                <TextField
                  value={filters.search}
                  className="ps-7"
                  type="search"
                  placeholder={t('browser_search_placeholder', { defaultValue: 'Name, map, host or code' })}
                  data-menu-item
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                />
              </div>
            </Field>
            <Field label={t('play_map', { defaultValue: 'Map' })}>
              <SelectField value={filters.map} onChange={(e) => setFilters({ ...filters, map: e.target.value })}>
                <option value="">{t('browser_any', { defaultValue: 'Any' })}</option>
                {TF2_MAPS.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.title}
                  </option>
                ))}
              </SelectField>
            </Field>
            <Field label={t('browser_quick_mode', { defaultValue: 'Mode' })}>
              <SelectField value={filters.mode} onChange={(e) => setFilters({ ...filters, mode: e.target.value as Tf2Mode | '' })}>
                <option value="">{t('browser_any', { defaultValue: 'Any' })}</option>
                {TF2_MODES.filter((m) => TF2_MAPS.some((x) => x.mode === m)).map((m) => (
                  <option key={m} value={m}>
                    {modeLabel(m)}
                  </option>
                ))}
              </SelectField>
            </Field>
            <Field label={t('browser_col_type', { defaultValue: 'Type' })}>
              <SelectField value={filters.kind} onChange={(e) => setFilters({ ...filters, kind: e.target.value as BrowserFilters['kind'] })}>
                <option value="">{t('browser_any', { defaultValue: 'Any' })}</option>
                <option value="dedicated">{t('browser_kind_dedicated', { defaultValue: 'Dedicated' })}</option>
                <option value="p2p">{t('browser_kind_p2p', { defaultValue: 'P2P' })}</option>
              </SelectField>
            </Field>
          </div>
          <div className="mb-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
            {(
              [
                ['notFull', t('browser_filter_not_full', { defaultValue: 'Not full' })],
                ['hasHumans', t('browser_filter_has_humans', { defaultValue: 'Has players' })],
                ['hideEmpty', t('browser_filter_hide_empty', { defaultValue: 'Hide empty' })],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex min-h-8 items-center gap-2">
                <Toggle checked={filters[key]} onChange={(v) => setFilters({ ...filters, [key]: v })} label={label} />
                {label}
              </label>
            ))}
          </div>

          {rooms === null ? (
            <EmptyNote>{t('play_rooms_loading', { defaultValue: 'Looking for servers…' })}</EmptyNote>
          ) : shown.length === 0 ? (
            <EmptyNote>
              {rooms.length === 0
                ? t('play_rooms_empty', { defaultValue: 'No public servers right now. Create one and invite your friends.' })
                : t('browser_no_match', { defaultValue: 'No server matches these filters.' })}
            </EmptyNote>
          ) : (
            <>
              {/* Phones: one card per room, read top to bottom. */}
              <ul className="grid gap-2 md:hidden">
                {shown.map((r) => (
                  <li key={r.code}>
                    <button
                      type="button"
                      data-menu-item
                      aria-pressed={selected === r.code}
                      onClick={() => setSelected(selected === r.code ? null : r.code)}
                      className={cn(
                        'grid w-full gap-1 rounded-(--app-radius-sm) border border-(--app-border) bg-(--app-bg) px-3 py-2 text-start',
                        selected === r.code && 'border-(--app-accent)',
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{r.name || r.code}</span>
                        <Pill tone={r.kind === 'p2p' ? 'info' : 'neutral'}>{kindLabel(r)}</Pill>
                      </span>
                      <span className="text-xs text-(--app-text-muted)">
                        {mapTitle(r.map)} · {modeLabel(r.mode)} · {playersLabel(r)} · {pingLabel(r)}
                      </span>
                      {r.kind === 'p2p' ? <span className="text-xs text-(--app-text-dim)">{hostLabel(r)}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
              {/* Wider screens: the game's own columns. */}
              <table className="hidden w-full table-fixed text-sm md:table">
                <thead className="border-b border-(--app-border) text-[11px]">
                  <tr>
                    {sortHeader('name', t('browser_col_name', { defaultValue: 'Name' }), 'w-[28%]')}
                    {sortHeader('map', t('play_map', { defaultValue: 'Map' }))}
                    {sortHeader('mode', t('browser_quick_mode', { defaultValue: 'Mode' }))}
                    {sortHeader('players', t('browser_col_players', { defaultValue: 'Players' }))}
                    {sortHeader('ping', t('scores_ping', { defaultValue: 'Ping' }), 'w-20')}
                    {sortHeader('host', t('browser_col_host', { defaultValue: 'Host' }))}
                    {sortHeader('kind', t('browser_col_type', { defaultValue: 'Type' }), 'w-24')}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.code} className={cn('border-b border-(--app-border)', selected === r.code && 'bg-(--app-accent-dim)')}>
                      <td className="truncate px-2 py-1">
                        <button
                          type="button"
                          data-menu-item
                          aria-pressed={selected === r.code}
                          onClick={() => setSelected(selected === r.code ? null : r.code)}
                          onDoubleClick={() => signedIn && !isFull(r) && join(r)}
                          className="block min-h-8 w-full truncate text-start font-semibold hover:text-(--app-accent-text)"
                        >
                          {favorites.some((f) => f.code === r.code) ? <Star className="me-1 inline size-3 text-(--app-warning)" aria-hidden /> : null}
                          {r.name || r.code}
                        </button>
                      </td>
                      <td className="truncate px-2 py-1 text-(--app-text-muted)">{mapTitle(r.map)}</td>
                      <td className="truncate px-2 py-1 text-(--app-text-muted)">{modeLabel(r.mode)}</td>
                      <td className="px-2 py-1 tabular-nums text-(--app-text-muted)">{playersLabel(r)}</td>
                      <td className="px-2 py-1 tabular-nums text-(--app-text-muted)">{pingLabel(r)}</td>
                      <td className="truncate px-2 py-1 text-(--app-text-muted)">{r.kind === 'p2p' ? r.host : '—'}</td>
                      <td className="px-2 py-1">
                        <Pill tone={r.kind === 'p2p' ? 'info' : 'neutral'}>{kindLabel(r)}</Pill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {total > (rooms?.length ?? 0) ? (
                <div className="mt-2 flex items-center justify-end gap-2 text-xs text-(--app-text-dim)">
                  {t('browser_page', { defaultValue: '{{from}}–{{to}} of {{total}}', from: offset + 1, to: offset + rooms.length, total })}
                  <Btn size="xs" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - TF2_LIMITS.BROWSE_CAP))}>
                    {t('browser_prev', { defaultValue: 'Previous' })}
                  </Btn>
                  <Btn size="xs" disabled={offset + rooms.length >= total} onClick={() => setOffset(offset + TF2_LIMITS.BROWSE_CAP)}>
                    {t('browser_next', { defaultValue: 'Next' })}
                  </Btn>
                </div>
              ) : null}
            </>
          )}
        </>
      ) : savedList.length === 0 ? (
        <EmptyNote>
          {view === 'favorites'
            ? t('browser_favorites_empty', { defaultValue: 'Star a server to keep it here.' })
            : t('browser_recent_empty', { defaultValue: 'Servers you join show up here.' })}
        </EmptyNote>
      ) : (
        <ul className="grid gap-2">
          {savedList.map((s) => {
            const r = live.get(s.code);
            return (
              <li key={s.code} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-(--app-radius-sm) border border-(--app-border) bg-(--app-bg) px-3 py-2">
                <button
                  type="button"
                  data-menu-item
                  className="min-w-0 flex-1 text-start"
                  onClick={() => r && setSelected(s.code)}
                  disabled={!r}
                >
                  <span className="block truncate text-sm font-semibold">{r?.name || s.name || s.code}</span>
                  <span className="block text-xs text-(--app-text-muted)">
                    {mapTitle(r?.map ?? s.map)} · {r ? playersLabel(r) : t('browser_saved_offline', { defaultValue: 'not listed now' })}
                  </span>
                </button>
                <span className="font-mono text-xs text-(--app-text-dim)">{s.code}</span>
                {signedIn ? (
                  <Btn size="xs" variant="secondary" onClick={() => join({ code: s.code, kind: r?.kind ?? s.kind }, false, s)} disabled={!!r && isFull(r)}>
                    {t('play_join', { defaultValue: 'Join' })}
                  </Btn>
                ) : null}
                {view === 'favorites' ? (
                  <IconBtn icon={Star} active label={t('browser_unfavorite', { defaultValue: 'Remove from favorites' })} onClick={() => toggleFavorite(s)} />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {selectedRoom ? (
        <RoomDetails
          room={selectedRoom}
          roster={details?.room?.roster ?? null}
          signedIn={signedIn}
          favorite={favorites.some((f) => f.code === selectedRoom.code)}
          pingLabel={pingLabel(selectedRoom)}
          playersLabel={playersLabel(selectedRoom)}
          mapTitle={mapTitle(selectedRoom.map)}
          modeLabel={modeLabel(selectedRoom.mode)}
          hostLabel={hostLabel(selectedRoom)}
          classNames={classNames}
          teamNames={teamNames}
          onJoin={(spectate, password) => join(selectedRoom, spectate, undefined, password)}
          onFavorite={() => toggleFavorite(selectedRoom)}
          signInLink={signInLink(t('browser_sign_in_join', { defaultValue: 'Sign in to join' }))}
        />
      ) : null}

      <form
        className="mt-4 flex flex-wrap items-end gap-2 border-t border-(--app-border) pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          // A code can name either kind of room; the hub tells the client which.
          if (codeValid && signedIn) onStart({ kind: 'online-join', code: code.trim().toUpperCase() });
        }}
      >
        <Field label={t('play_code', { defaultValue: 'Join by code' })} className="min-w-40 flex-1">
          <TextField
            value={code}
            maxLength={TF2_LIMITS.ROOM_CODE_LENGTH}
            autoCapitalize="characters"
            spellCheck={false}
            data-menu-item
            placeholder={t('play_code_placeholder', { defaultValue: 'ABC234' })}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </Field>
        {signedIn ? (
          <Btn type="submit" size="sm" icon={KeyRound} disabled={!codeValid} data-menu-item>
            {t('play_join', { defaultValue: 'Join' })}
          </Btn>
        ) : (
          signInLink(t('browser_sign_in_join', { defaultValue: 'Sign in to join' }))
        )}
      </form>
    </section>
  );
}

function RoomDetails({
  room,
  roster,
  signedIn,
  favorite,
  pingLabel,
  playersLabel,
  mapTitle,
  modeLabel,
  hostLabel,
  classNames,
  teamNames,
  onJoin,
  onFavorite,
  signInLink,
}: {
  room: RoomListEntry;
  roster: RoomDetailsPayload['room'] extends infer R ? (R extends { roster: infer P } ? P | null : null) : null;
  signedIn: boolean;
  favorite: boolean;
  pingLabel: string;
  playersLabel: string;
  mapTitle: string;
  modeLabel: string;
  hostLabel: string;
  classNames: readonly string[];
  teamNames: readonly string[];
  onJoin: (spectate: boolean, password?: string) => void;
  onFavorite: () => void;
  signInLink: ReactNode;
}) {
  const { t } = useTranslation('c-tf2-game');
  const invite = useLobbyLink({ code: room.code, path: '/tf2/play' });
  const full = isFull(room) || room.locked === true;
  const round = room.round;
  const [password, setPassword] = useState('');
  return (
    <section className="mt-4 rounded-(--app-radius-sm) border border-(--app-border-bright) bg-(--app-bg) p-4" aria-label={t('browser_details', { defaultValue: 'Server details' })} aria-live="polite">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {room.kind === 'p2p' ? <Share2 className="size-4 text-(--app-accent-text)" aria-hidden /> : <Server className="size-4 text-(--app-accent-text)" aria-hidden />}
        <h3 className="min-w-0 flex-1 truncate text-base font-semibold">{room.name || room.code}</h3>
        <IconBtn
          icon={Star}
          active={favorite}
          label={favorite ? t('browser_unfavorite', { defaultValue: 'Remove from favorites' }) : t('browser_favorite', { defaultValue: 'Add to favorites' })}
          onClick={onFavorite}
        />
        <Btn size="xs" variant="ghost" onClick={() => void invite.copyLink()}>
          {invite.copied ? t('browser_copied', { defaultValue: 'Copied' }) : t('play_invite', { defaultValue: 'Copy the invite link' })}
        </Btn>
      </div>
      <dl className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-(--app-text-dim)">{t('play_map', { defaultValue: 'Map' })}</dt>
          <dd>{mapTitle}</dd>
        </div>
        <div>
          <dt className="text-(--app-text-dim)">{t('browser_quick_mode', { defaultValue: 'Mode' })}</dt>
          <dd>{modeLabel}</dd>
        </div>
        <div>
          <dt className="text-(--app-text-dim)">{t('browser_col_players', { defaultValue: 'Players' })}</dt>
          <dd className="tabular-nums">{playersLabel}</dd>
        </div>
        <div>
          <dt className="text-(--app-text-dim)">{t('scores_ping', { defaultValue: 'Ping' })}</dt>
          <dd className="tabular-nums">{pingLabel}</dd>
        </div>
        <div>
          <dt className="text-(--app-text-dim)">{t('browser_round', { defaultValue: 'Round' })}</dt>
          <dd>{round ? round.state.replace(/_/g, ' ') : '—'}</dd>
        </div>
        <div>
          <dt className="text-(--app-text-dim)">{t('browser_time_left', { defaultValue: 'Time left' })}</dt>
          <dd className="tabular-nums">{round?.timeLeft != null ? formatClock(round.timeLeft) : '—'}</dd>
        </div>
        <div>
          <dt className="text-(--app-text-dim)">{t('browser_score', { defaultValue: 'Score' })}</dt>
          <dd className="tabular-nums">{room.teamScores ? `${teamNames[2] ?? 'RED'} ${room.teamScores[0]} · ${teamNames[3] ?? 'BLU'} ${room.teamScores[1]}` : '—'}</dd>
        </div>
        <div>
          <dt className="text-(--app-text-dim)">{t('browser_col_type', { defaultValue: 'Type' })}</dt>
          <dd>{room.kind === 'p2p' ? hostLabel : t('browser_kind_dedicated', { defaultValue: 'Dedicated' })}</dd>
        </div>
      </dl>
      {roster === null ? (
        <EmptyNote>{t('browser_details_loading', { defaultValue: 'Loading players…' })}</EmptyNote>
      ) : roster.length === 0 ? (
        <EmptyNote>{t('browser_details_empty', { defaultValue: 'Nobody has spawned yet.' })}</EmptyNote>
      ) : (
        <ul className="mb-3 grid gap-1 text-xs sm:grid-cols-2">
          {[...roster]
            .sort((a, b) => a.team - b.team || b.score - a.score)
            .map((p, i) => (
              <li key={`${p.name}-${i}`} className="flex items-center gap-2 rounded-(--app-radius-sm) bg-(--app-bg-subtle) px-2 py-1">
                <span className={cn('size-2 shrink-0 rounded-full', p.team === 2 ? 'bg-(--app-danger)' : p.team === 3 ? 'bg-(--app-info)' : 'bg-(--app-text-dim)')} aria-hidden />
                <span className="min-w-0 flex-1 truncate">
                  {p.name}
                  {p.bot ? <span className="ms-1 text-(--app-text-dim)">{t('scores_bot', { defaultValue: 'BOT' })}</span> : null}
                </span>
                <span className="text-(--app-text-dim)">{classNames[p.cls] ?? ''}</span>
                <span className="w-8 text-end tabular-nums">{p.score}</span>
              </li>
            ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        {signedIn ? (
          <>
            {room.passworded && !room.locked ? (
              <TextField
                type="password"
                autoComplete="off"
                maxLength={32}
                className="w-40"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('browser_password', { defaultValue: 'Password' })}
                aria-label={t('browser_password', { defaultValue: 'Password' })}
              />
            ) : null}
            <Btn variant="primary" size="sm" icon={Users} onClick={() => onJoin(false, password)} disabled={full} data-menu-item>
              {room.locked
                ? t('browser_locked', { defaultValue: 'Locked' })
                : full
                  ? t('browser_full', { defaultValue: 'Full' })
                  : t('play_join', { defaultValue: 'Join' })}
            </Btn>
            <Btn size="sm" icon={Eye} onClick={() => onJoin(true, password)} disabled={full} data-menu-item>
              {t('browser_join_spectate', { defaultValue: 'Join as spectator' })}
            </Btn>
          </>
        ) : (
          signInLink
        )}
      </div>
    </section>
  );
}
