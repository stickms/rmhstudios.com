'use client';

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { toast } from 'sonner';
import {
  Bomb,
  Check,
  ChevronDown,
  ChevronUp,
  Crown,
  Eye,
  EyeOff,
  Globe,
  Info,
  Loader2,
  Lock,
  Minus,
  Moon,
  RotateCw,
  Scale,
  Send,
  Settings,
  Share2,
  Shuffle,
  Sun,
  Target,
  UserX,
  Vote,
  Users,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { useSession } from '@/components/Providers';
import { useSliceItStore } from '@/lib/slice-it/store';
import { calculateScoreMultiplier } from '@/lib/slice-it/scoring';
import { forMultiplayer } from '@/lib/slice-it/modifiers';
import { MAX_LOBBY_PLAYERS, MAX_SPEED, MULTIPLAYER_MIN_SPEED } from '@/lib/slice-it/constants';
import type { Modifiers, SliceSong } from '@/lib/slice-it/types';
import type { LobbyPlayer, TeamId, VoteState } from '@/lib/slice-it/net/events';
import * as net from '@/lib/slice-it/net/client';
import { SongLibrary } from './SongLibrary';
import { SongDetailsPanel } from './SongDetailsPanel';
import { SpectatorView } from './spectate/SpectatorView';

interface MultiplayerLobbyProps {
  onBack: () => void;
  onOpenSettings?: () => void;
}

/**
 * The multiplayer lobby.
 *
 * Everything rendered here comes from the server's `LobbySnapshot`. The
 * previous version kept three parallel copies of the same state — a `lobbyData`
 * built from one event, an `opponents` record built from another, and a
 * `myDifficulty` that was authoritative on the client and merely *reported* to
 * the server. They could disagree, and the failure mode was quiet: a player
 * whose modifiers the server had clamped still saw their original choice, and
 * the score multiplier shown beside their name was computed from a value the
 * server had already rejected.
 */
export function MultiplayerLobby({ onBack, onOpenSettings }: MultiplayerLobbyProps) {
  const { t } = useTranslation('c-game');
  /**
   * The Slice It page namespace, for everything this wave added.
   *
   * Two translators rather than one because the existing lobby copy is already
   * shipped under `c-game` and moving it would change every key — and a changed
   * key is a new string in every one of the sixteen locales. The multiplayer
   * mode copy (`N1`, `N2`, `N7`, `N9`) lives in `r-slice-it` with the rest of
   * this game's own strings.
   */
  const { t: ts } = useTranslation('r-slice-it');
  const { data: session, isPending } = useSession();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as Record<string, string | undefined>;

  const lobby = useSliceItStore((s) => s.lobby);
  const connection = useSliceItStore((s) => s.connection);
  const selfSocketId = useSliceItStore((s) => s.selfSocketId);
  const lobbyError = useSliceItStore((s) => s.lobbyError);
  const publicLobbies = useSliceItStore((s) => s.publicLobbies);
  const chat = useSliceItStore((s) => s.chat);
  const modifiers = useSliceItStore((s) => s.modifiers);
  const setModifiers = useSliceItStore((s) => s.setModifiers);
  const isDarkMode = useSliceItStore((s) => s.isDarkMode);
  const setIsDarkMode = useSliceItStore((s) => s.setIsDarkMode);

  const [codeInput, setCodeInput] = React.useState('');
  const [copied, setCopied] = React.useState(false);
  const [showSongSelect, setShowSongSelect] = React.useState(false);
  const [browsedSong, setBrowsedSong] = React.useState<SliceSong | null>(null);
  const [showModifiers, setShowModifiers] = React.useState(false);
  const [chatDraft, setChatDraft] = React.useState('');
  const [connecting, setConnecting] = React.useState(false);
  /**
   * The lobby being watched (`N1`), or null.
   *
   * Local, not in the store: a spectator's store holds an ordinary
   * `LobbySnapshot` — that is the whole point of the role — so "am I watching or
   * seated" is a question only the component that made the choice can answer.
   */
  const [spectatingCode, setSpectatingCode] = React.useState<string | null>(null);

  const me = lobby?.players.find((p) => p.socketId === selfSocketId) ?? null;
  const isHost = Boolean(me?.isHost);

  /* ── Connection ──────────────────────────────────────────────────────── */

  React.useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setConnecting(true);
    net
      .connectSliceIt()
      .catch(() => {
        if (!cancelled) {
          toast.error(
            t('mp-connect-failed', { defaultValue: 'Could not reach the multiplayer server.' }),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setConnecting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session, t]);

  /**
   * Drop `?lobby=`/`?watch=` from the URL.
   *
   * Both a cleanup and a fix: leaving the parameters on means a refresh — or the
   * back button — re-runs the auto-join against a lobby the player has just
   * decided to leave, and against a *dead* code that is the loop `N9` exists to
   * stop. Declared above the effect that calls it so the React Compiler can see
   * the dependency it is holding.
   */
  const clearInviteParams = React.useCallback(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('lobby') && !url.searchParams.has('watch')) return;
    url.searchParams.delete('lobby');
    url.searchParams.delete('watch');
    void navigate({ to: url.pathname + (url.search || ''), replace: true });
  }, [navigate]);

  /**
   * Act on an invite link (`N9`).
   *
   * The code is validated *before* anything is emitted. A stale link — a lobby
   * that ended last week, a code a chat client line-wrapped — used to be sent
   * verbatim, which set the client's reconnect code as a side effect: every
   * subsequent reconnect re-sent the same dead join and got the same
   * `not_found` back, one error toast at a time. A malformed code now lands the
   * player in the menu with one message and the parameter stripped, which is the
   * only state they can act from.
   *
   * `?watch=1` sends them to the spectator view instead of a seat, so a link
   * shared after the match started is still worth following.
   */
  const autoJoinedRef = React.useRef(false);
  React.useEffect(() => {
    // Read the URL as well as the router's parsed search. `/slice-it`'s
    // `validateSearch` is the library's filter schema, and a zod object strips
    // the keys it does not declare — so `?lobby=` reaches `window.location` and
    // stops there. Asking both means the link works today, and keeps working the
    // moment the route declares the parameter (see
    // `docs/_handoff/multiplayer-requests.md`).
    const params =
      typeof window === 'undefined' ? null : new URLSearchParams(window.location.search);
    const raw = search.lobby ?? params?.get('lobby') ?? null;
    const watch = search.watch ?? params?.get('watch') ?? null;
    if (!raw || autoJoinedRef.current) return;
    if (connection !== 'connected' || lobby) return;
    autoJoinedRef.current = true;

    const code = net.normalizeLobbyCode(raw);
    if (!code) {
      toast.error(
        ts('mp-invite-invalid', { defaultValue: 'That invite link is not a valid lobby code.' }),
      );
      clearInviteParams();
      return;
    }
    if (watch) {
      setSpectatingCode(code);
      net.spectateLobby(code);
    } else {
      net.joinLobby(code);
    }
  }, [search.lobby, search.watch, connection, lobby, ts, clearInviteParams]);

  // Refresh the public list while outside a lobby.
  React.useEffect(() => {
    if (lobby || connection !== 'connected') return;
    net.browseLobbies();
    const interval = setInterval(() => net.browseLobbies(), 8000);
    return () => clearInterval(interval);
  }, [lobby, connection]);

  // Push the local modifier choice up whenever it changes while seated. The
  // server clamps it and echoes the result back in the snapshot, which is what
  // the roster renders — so what you see beside your name is what will be used.
  React.useEffect(() => {
    if (!lobby) return;
    net.setLobbyModifiers(modifiers);
  }, [lobby, modifiers]);

  React.useEffect(() => {
    if (!lobbyError) return;
    toast.error(errorMessage(lobbyError, t, ts));
    useSliceItStore.getState().setLobbyError(null);
  }, [lobbyError, t, ts]);

  // A closed tab frees the seat at once rather than making everyone sit through
  // the disconnect grace window for someone who is not coming back.
  React.useEffect(() => {
    const onUnload = () => net.leaveLobby();
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, []);

  const handleLeave = React.useCallback(() => {
    net.leaveLobby();
    net.disconnectSliceIt();
    setSpectatingCode(null);
    clearInviteParams();
    onBack();
  }, [clearInviteParams, onBack]);

  /** Stop watching without leaving multiplayer — back to the menu, not the game. */
  const handleStopWatching = React.useCallback(() => {
    net.leaveLobby();
    setSpectatingCode(null);
    clearInviteParams();
  }, [clearInviteParams]);

  const handleCopyInvite = (watch = false) => {
    if (!lobby) return;
    void navigator.clipboard.writeText(net.inviteLink(lobby.code, watch)).then(() => {
      setCopied(true);
      toast.success(
        watch
          ? ts('mp-watch-link-copied', { defaultValue: 'Spectator link copied to clipboard!' })
          : t('invite-link-copied', { defaultValue: 'Invite link copied to clipboard!' }),
      );
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const patchModifiers = (patch: Partial<Modifiers>) => {
    setModifiers(forMultiplayer({ ...modifiers, ...patch }));
  };

  /* ── Gates ───────────────────────────────────────────────────────────── */

  if (isPending) {
    return (
      <Shell>
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" aria-hidden />
        <span className="sr-only">{t('loading', { defaultValue: 'Loading' })}</span>
      </Shell>
    );
  }

  if (!session) {
    return (
      <Shell>
        <Card className="w-full max-w-md bg-slice-bg shadow-[20px_20px_60px_var(--slice-shadow-dark),-20px_-20px_60px_var(--slice-shadow-light)] rounded-[2rem] border-none p-8 text-center">
          <h2 className="text-2xl font-black text-slice-text-darker mb-4">
            {t('multiplayer', { defaultValue: 'MULTIPLAYER' })}
          </h2>
          <p className="text-slice-text-muted mb-6 font-medium">
            {t('sign-in-prompt', {
              defaultValue:
                'To play online and track your stats, you need to sign in with your account.',
            })}
          </p>
          <Button
            className="w-full py-6 bg-blue-500 hover:bg-blue-600 text-white font-bold shadow-lg rounded-xl text-lg mb-4"
            onClick={() => {
              window.location.href = `/login?callbackURL=${encodeURIComponent(window.location.pathname)}`;
            }}
          >
            {t('sign-in-sign-up', { defaultValue: 'SIGN IN / SIGN UP' })}
          </Button>
          <Button variant="ghost" onClick={onBack} className="text-slice-text-light">
            {t('cancel', { defaultValue: 'CANCEL' })}
          </Button>
        </Card>
      </Shell>
    );
  }

  /* ── Watching (`N1`) ─────────────────────────────────────────────────── */

  // Checked before the seated branches: a spectator's snapshot looks exactly
  // like a player's, so the ordinary lobby card would render for them and offer
  // a READY button the server would ignore.
  if (spectatingCode) {
    return <SpectatorView code={spectatingCode} onLeave={handleStopWatching} />;
  }

  /* ── Song picker ─────────────────────────────────────────────────────── */

  // Open to everyone while a ballot is running (`N7`) — nominating is the whole
  // point — and to the host alone the rest of the time.
  if (lobby && showSongSelect && (isHost || lobby.vote)) {
    return (
      <div className="absolute inset-0 z-60 bg-slice-bg p-4 flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-slice-text-darker">
            {lobby.vote
              ? ts('mp-nominate-a-song', { defaultValue: 'NOMINATE A SONG' })
              : t('select-a-song', { defaultValue: 'SELECT A SONG' })}
          </h2>
          <Button variant="ghost" onClick={() => setShowSongSelect(false)}>
            {t('cancel', { defaultValue: 'CANCEL' })}
          </Button>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden rounded-2xl shadow-[inset_10px_10px_20px_var(--slice-shadow-dark),inset_-10px_-10px_20px_var(--slice-shadow-light)]">
          <SongLibrary
            selectedSongId={lobby.song?.id ?? null}
            onSelect={(song) => {
              // Only the id crosses the wire; the server resolves the row —
              // whichever of the two things it is being asked to do with it.
              if (lobby.vote) net.nominateSong(song.id);
              else net.selectSong(song.id);
              setShowSongSelect(false);
            }}
            onHighlight={setBrowsedSong}
          />
        </div>
      </div>
    );
  }

  /* ── Song details ────────────────────────────────────────────────────── */

  if (lobby && browsedSong) {
    return (
      <div className="absolute inset-0 z-60 bg-slice-bg flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slice-shadow-dark/30 shrink-0">
          <h2 className="text-lg font-black text-slice-text">
            {t('song-details', { defaultValue: 'Song Details' })}
          </h2>
          <Button variant="ghost" onClick={() => setBrowsedSong(null)}>
            {t('back-to-lobby', { defaultValue: '← Back to Lobby' })}
          </Button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <SongDetailsPanel
            song={browsedSong}
            onPlay={() => {}}
            onSongUpdated={(updates) => setBrowsedSong((s) => (s ? { ...s, ...updates } : s))}
            readOnly
          />
        </div>
      </div>
    );
  }

  /* ── Inside a lobby ──────────────────────────────────────────────────── */

  if (lobby) {
    const readyCount = lobby.players.filter((p) => p.isHost || p.ready).length;
    // Mirrors the server's own check (`N2`): a team match with an empty side is
    // a free-for-all whose results card claims a winner by forfeit. Shown here
    // so the host can see *why* Start is disabled rather than pressing it and
    // reading an error toast.
    const sidesFilled =
      !lobby.teamsEnabled ||
      (['a', 'b'] as const).every((team) => lobby.players.some((p) => p.team === team));
    const canStart = Boolean(lobby.song) && readyCount === lobby.players.length && sidesFilled;

    return (
      <div className="absolute inset-0 z-60 flex items-center-safe justify-center-safe overflow-y-auto bg-slice-bg p-4 text-slice-text">
        <Card className="w-full max-w-2xl bg-slice-bg shadow-[20px_20px_60px_var(--slice-shadow-dark),-20px_-20px_60px_var(--slice-shadow-light)] rounded-[2rem] border-none my-auto">
          <CardHeader>
            <div className="flex justify-between items-center gap-2 mb-2">
              <ConnectionPill connection={connection} />
              <div className="flex items-center gap-2">
                <IconToggle
                  onClick={() => setIsDarkMode(!isDarkMode)}
                  label={
                    isDarkMode
                      ? t('switch-to-light-mode', { defaultValue: 'Switch to Light Mode' })
                      : t('switch-to-dark-mode', { defaultValue: 'Switch to Dark Mode' })
                  }
                >
                  {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                </IconToggle>
                {onOpenSettings && (
                  <IconToggle
                    onClick={onOpenSettings}
                    label={t('settings', { defaultValue: 'Settings' })}
                  >
                    <Settings className="w-5 h-5" />
                  </IconToggle>
                )}
              </div>
            </div>

            <CardTitle className="text-2xl font-black text-center text-slice-text-darker flex flex-col items-center gap-2">
              <span>{t('lobby-code', { defaultValue: 'LOBBY CODE' })}</span>
              <span className="flex items-center gap-3">
                <span className="text-3xl sm:text-4xl tracking-widest text-blue-500 bg-slice-bg px-3 sm:px-4 py-2 rounded-2xl shadow-[inset_5px_5px_10px_var(--slice-shadow-dark),inset_-5px_-5px_10px_var(--slice-shadow-light)] font-mono">
                  {lobby.code}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-12 w-12 shrink-0 rounded-2xl shadow-[5px_5px_10px_var(--slice-shadow-dark),-5px_-5px_10px_var(--slice-shadow-light)] active:shadow-[inset_2px_2px_5px_var(--slice-shadow-dark),inset_-2px_-2px_5px_var(--slice-shadow-light)]"
                  onClick={() => handleCopyInvite()}
                  title={t('copy-invite-link', { defaultValue: 'Copy Invite Link' })}
                  aria-label={t('copy-invite-link', { defaultValue: 'Copy Invite Link' })}
                >
                  {copied ? (
                    <Check className="w-6 h-6 text-green-500" />
                  ) : (
                    <Share2 className="w-6 h-6 text-slice-text-darker" />
                  )}
                </Button>
                {/* A seat is not always the useful thing to offer: once a match
                    is under way the only link worth sending is one that watches
                    it (`N1`, `N9`). */}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-12 w-12 shrink-0 rounded-2xl shadow-[5px_5px_10px_var(--slice-shadow-dark),-5px_-5px_10px_var(--slice-shadow-light)] active:shadow-[inset_2px_2px_5px_var(--slice-shadow-dark),inset_-2px_-2px_5px_var(--slice-shadow-light)]"
                  onClick={() => handleCopyInvite(true)}
                  title={ts('mp-copy-watch-link', { defaultValue: 'Copy Spectator Link' })}
                  aria-label={ts('mp-copy-watch-link', { defaultValue: 'Copy Spectator Link' })}
                >
                  <Eye className="w-6 h-6 text-slice-text-darker" />
                </Button>
              </span>
              {isHost && (
                <span className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
                  <button
                    className="text-[11px] font-bold uppercase tracking-widest text-slice-text-muted hover:text-blue-500 flex items-center gap-1.5"
                    onClick={() => net.setLobbySettings(!lobby.isPublic)}
                  >
                    {lobby.isPublic ? (
                      <>
                        <Globe className="w-3 h-3" aria-hidden />
                        {t('lobby-public', { defaultValue: 'Public — listed in Quick Play' })}
                      </>
                    ) : (
                      <>
                        <Lock className="w-3 h-3" aria-hidden />
                        {t('lobby-private', { defaultValue: 'Private — invite only' })}
                      </>
                    )}
                  </button>
                  <ModeToggle
                    on={lobby.teamsEnabled}
                    onClick={() => net.setTeamMode(!lobby.teamsEnabled)}
                    Icon={Users}
                    label={
                      lobby.teamsEnabled
                        ? ts('mp-teams-on', { defaultValue: 'Teams — on' })
                        : ts('mp-teams-off', { defaultValue: 'Teams — off' })
                    }
                  />
                  <ModeToggle
                    on={lobby.votingEnabled}
                    onClick={() => net.setVoteMode(!lobby.votingEnabled)}
                    Icon={Vote}
                    label={
                      lobby.votingEnabled
                        ? ts('mp-voting-on', { defaultValue: 'Song vote — on' })
                        : ts('mp-voting-off', { defaultValue: 'Song vote — off' })
                    }
                  />
                </span>
              )}
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-5">
            <section className="space-y-2">
              <h3 className="font-bold text-xs text-slice-text-light uppercase tracking-widest">
                {t('players-count', {
                  defaultValue: 'Players ({{count}}/{{max}})',
                  count: lobby.players.length,
                  max: MAX_LOBBY_PLAYERS,
                })}
              </h3>
              <ul className="max-h-56 overflow-y-auto space-y-2 pr-1">
                {lobby.players.map((player) => (
                  <PlayerRow
                    key={player.userId}
                    player={player}
                    isSelf={player.socketId === selfSocketId}
                    canKick={isHost && player.socketId !== selfSocketId}
                    onKick={() => net.kickPlayer(player.socketId)}
                  />
                ))}
              </ul>

              {lobby.teamsEnabled && (
                <TeamControls
                  myTeam={me?.team ?? null}
                  isHost={isHost}
                  players={lobby.players}
                  disabled={connection !== 'connected' || lobby.state !== 'waiting'}
                />
              )}
            </section>

            {lobby.vote && (
              <VotePanel
                vote={lobby.vote}
                selfSocketId={selfSocketId}
                disabled={connection !== 'connected'}
                onNominate={() => setShowSongSelect(true)}
              />
            )}

            <section className="space-y-2">
              <h3 className="font-bold text-xs text-slice-text-light uppercase tracking-widest">
                {t('selected-song', { defaultValue: 'Selected Song' })}
              </h3>
              <div className="bg-slice-bg p-4 rounded-xl shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)] flex justify-between items-center gap-3">
                {lobby.song ? (
                  <span className="min-w-0">
                    <span className="block font-bold truncate">{lobby.song.title}</span>
                    <span className="block text-xs text-slice-text-muted truncate">
                      {lobby.song.artist} · {formatDuration(lobby.song.duration)}
                      {lobby.song.bpm > 0 ? ` · ${Math.round(lobby.song.bpm)} BPM` : ''}
                    </span>
                  </span>
                ) : (
                  <span className="text-slice-text-light italic">
                    {t('no-song-selected', { defaultValue: 'No song selected' })}
                  </span>
                )}
                <Button
                  size="sm"
                  variant={isHost || lobby.vote ? 'default' : 'outline'}
                  onClick={() => setShowSongSelect(true)}
                  disabled={!isHost && !lobby.vote}
                  className="shrink-0"
                >
                  {lobby.vote
                    ? ts('mp-nominate', { defaultValue: 'NOMINATE' })
                    : isHost
                      ? t('change', { defaultValue: 'CHANGE' })
                      : t('host-picks', { defaultValue: 'HOST PICKS' })}
                </Button>
              </div>
            </section>

            <section className="space-y-2">
              <button
                className="flex items-center gap-2 font-bold text-sm text-slice-text-darker uppercase tracking-widest hover:text-blue-500 w-full bg-slice-bg p-3 rounded-xl shadow-[3px_3px_6px_var(--slice-shadow-dark),-3px_-3px_6px_var(--slice-shadow-light)]"
                onClick={() => setShowModifiers((v) => !v)}
                aria-expanded={showModifiers}
              >
                <Zap className="w-4 h-4" aria-hidden />
                {t('my-difficulty-modifiers', { defaultValue: 'My Difficulty & Modifiers' })}
                {showModifiers ? (
                  <ChevronUp className="w-4 h-4 ml-auto" aria-hidden />
                ) : (
                  <ChevronDown className="w-4 h-4 ml-auto" aria-hidden />
                )}
                <MultiplierBadge value={calculateScoreMultiplier(modifiers)} />
              </button>

              {showModifiers && <ModifierPanel modifiers={modifiers} onChange={patchModifiers} />}
            </section>

            <LobbyChat
              chat={chat}
              draft={chatDraft}
              onDraft={setChatDraft}
              onSend={() => {
                net.sendChat(chatDraft);
                setChatDraft('');
              }}
            />

            <div className="flex gap-3 pt-1">
              <Button
                variant="ghost"
                className="flex-1 text-slice-text-muted hover:text-red-500"
                onClick={handleLeave}
              >
                {t('leave', { defaultValue: 'LEAVE' })}
              </Button>
              {isHost ? (
                <Button
                  className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-bold shadow-lg rounded-xl disabled:opacity-50"
                  onClick={() => net.startMatch()}
                  disabled={!canStart || connection !== 'connected'}
                >
                  {!lobby.song
                    ? t('select-a-song', { defaultValue: 'SELECT A SONG' })
                    : !sidesFilled
                      ? ts('mp-both-teams-needed', { defaultValue: 'BOTH TEAMS NEED A PLAYER' })
                      : !canStart
                        ? t('waiting-ready', {
                            defaultValue: 'WAITING ({{ready}}/{{total}} READY)',
                            ready: readyCount,
                            total: lobby.players.length,
                          })
                        : t('start-game', { defaultValue: 'START GAME' })}
                </Button>
              ) : (
                <Button
                  className={`flex-1 font-bold shadow-lg rounded-xl text-white ${
                    me?.ready
                      ? 'bg-green-500 hover:bg-green-600'
                      : 'bg-orange-500 hover:bg-orange-600'
                  }`}
                  onClick={() => net.setReady(!me?.ready)}
                  disabled={connection !== 'connected'}
                >
                  {me?.ready
                    ? t('ready-check', { defaultValue: '✔ READY' })
                    : t('ready-up', { defaultValue: 'READY UP' })}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  /* ── Outside a lobby ─────────────────────────────────────────────────── */

  return (
    <Shell>
      <Card className="w-full max-w-lg bg-slice-bg shadow-[20px_20px_60px_var(--slice-shadow-dark),-20px_-20px_60px_var(--slice-shadow-light)] rounded-[2rem] border-none">
        <CardHeader>
          <div className="flex justify-center mb-1">
            <ConnectionPill connection={connection} />
          </div>
          <CardTitle className="text-2xl font-black text-center text-slice-text-darker">
            {t('multiplayer', { defaultValue: 'MULTIPLAYER' })}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="text-center">
            <div className="text-xs font-bold text-slice-text-light uppercase mb-1">
              {t('signed-in-as', { defaultValue: 'Signed in as' })}
            </div>
            <div className="font-bold text-lg text-slice-text">{session.user.name}</div>
          </div>

          <Button
            className="w-full py-6 bg-blue-500 hover:bg-blue-600 text-white font-bold shadow-lg rounded-xl text-lg"
            onClick={() => net.quickplay()}
            disabled={connection !== 'connected'}
          >
            {connecting
              ? t('connecting', { defaultValue: 'CONNECTING…' })
              : t('quick-play', { defaultValue: 'QUICK PLAY' })}
          </Button>

          <div className="flex gap-2">
            <Input
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase().slice(0, 6))}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                // `joinLobby` refuses a code that is not one (`N9`) and says so,
                // rather than sending it and letting the socket answer.
                if (!net.joinLobby(codeInput)) {
                  toast.error(
                    ts('mp-code-invalid', {
                      defaultValue: 'A lobby code is 6 letters and numbers.',
                    }),
                  );
                }
              }}
              placeholder={t('lobby-code-placeholder', { defaultValue: 'Lobby Code' })}
              className="bg-(--slice-input-bg) border-(--slice-input-border) text-slice-text shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)] rounded-xl uppercase text-center font-mono tracking-widest h-12"
              aria-label={t('lobby-code', { defaultValue: 'LOBBY CODE' })}
            />
            <Button
              className="bg-slice-bg text-blue-500 font-bold shadow-[5px_5px_10px_var(--slice-shadow-dark),-5px_-5px_10px_var(--slice-shadow-light)] rounded-xl px-6"
              onClick={() => net.joinLobby(codeInput)}
              disabled={!net.normalizeLobbyCode(codeInput) || connection !== 'connected'}
            >
              {t('join', { defaultValue: 'JOIN' })}
            </Button>
          </div>

          <Button
            variant="outline"
            className="w-full rounded-xl shadow-[3px_3px_6px_var(--slice-shadow-dark),-3px_-3px_6px_var(--slice-shadow-light)]"
            onClick={() => net.createLobby(false)}
            disabled={connection !== 'connected'}
          >
            {t('create-lobby', { defaultValue: 'CREATE PRIVATE LOBBY' })}
          </Button>

          {publicLobbies.length > 0 && (
            <section className="space-y-2">
              <h3 className="font-bold text-xs text-slice-text-light uppercase tracking-widest">
                {t('open-lobbies', { defaultValue: 'Open Lobbies' })}
              </h3>
              <ul className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {publicLobbies.map((row) => (
                  <li key={row.code} className="flex items-stretch gap-2">
                    <button
                      className="flex-1 flex items-center justify-between gap-3 p-3 rounded-xl bg-slice-bg shadow-[3px_3px_6px_var(--slice-shadow-dark),-3px_-3px_6px_var(--slice-shadow-light)] hover:text-blue-500 text-left"
                      onClick={() => net.joinLobby(row.code)}
                    >
                      <span className="min-w-0">
                        <span className="font-mono font-black tracking-widest">{row.code}</span>
                        <span className="block text-xs text-slice-text-muted truncate">
                          {row.hostName}
                          {row.songTitle ? ` · ${row.songTitle}` : ''}
                        </span>
                      </span>
                      <span className="text-xs font-bold text-slice-text-light shrink-0">
                        {row.playerCount}/{row.maxPlayers}
                      </span>
                    </button>
                    {/* Watching takes no seat (`N1`), so it stays available when
                        joining would not — a full lobby, or one mid-match. */}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-auto w-11 shrink-0 rounded-xl shadow-[3px_3px_6px_var(--slice-shadow-dark),-3px_-3px_6px_var(--slice-shadow-light)]"
                      onClick={() => {
                        if (net.spectateLobby(row.code)) setSpectatingCode(row.code);
                      }}
                      title={ts('mp-watch', { defaultValue: 'Watch' })}
                      aria-label={ts('mp-watch', { defaultValue: 'Watch' })}
                    >
                      <Eye className="w-4 h-4 text-slice-text-muted" />
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <Button variant="ghost" className="w-full text-slice-text-light" onClick={handleLeave}>
            {t('back-to-menu', { defaultValue: 'BACK TO MENU' })}
          </Button>
        </CardContent>
      </Card>
    </Shell>
  );
}

/* ─── Pieces ─────────────────────────────────────────────────────────────── */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-60 flex items-center-safe justify-center-safe overflow-y-auto overscroll-contain bg-slice-bg p-4 text-slice-text">
      {children}
    </div>
  );
}

function IconToggle({
  children,
  onClick,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-10 w-10 shrink-0 text-slice-text-muted hover:text-slice-text rounded-lg"
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      {children}
    </Button>
  );
}

function ConnectionPill({ connection }: { connection: string }) {
  const { t } = useTranslation('c-game');
  if (connection === 'connected') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-green-600">
        <span className="w-2 h-2 rounded-full bg-green-500" aria-hidden />
        {t('conn-live', { defaultValue: 'Live' })}
      </span>
    );
  }
  const reconnecting = connection === 'reconnecting' || connection === 'connecting';
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest ${
        reconnecting ? 'text-amber-500' : 'text-red-500'
      }`}
      role="status"
    >
      <Loader2 className={`w-3 h-3 ${reconnecting ? 'animate-spin' : ''}`} aria-hidden />
      {reconnecting
        ? t('conn-reconnecting', { defaultValue: 'Reconnecting…' })
        : t('conn-offline', { defaultValue: 'Offline' })}
    </span>
  );
}

/** A host-only lobby mode switch — teams (`N2`), song voting (`N7`). */
function ModeToggle({
  on,
  onClick,
  Icon,
  label,
}: {
  on: boolean;
  onClick: () => void;
  Icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  label: string;
}) {
  return (
    <button
      className={`text-[11px] font-bold uppercase tracking-widest flex items-center gap-1.5 ${
        on ? 'text-blue-500' : 'text-slice-text-muted hover:text-blue-500'
      }`}
      onClick={onClick}
      aria-pressed={on}
    >
      <Icon className="w-3 h-3" aria-hidden />
      {label}
    </button>
  );
}

const TEAM_STYLES: Record<TeamId, string> = {
  a: 'bg-blue-500/20 text-blue-500',
  b: 'bg-orange-500/20 text-orange-500',
};

function TeamBadge({ team }: { team: TeamId }) {
  const { t } = useTranslation('r-slice-it');
  return (
    <span
      className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full shrink-0 ${TEAM_STYLES[team]}`}
    >
      {team === 'a'
        ? t('mp-team-a', { defaultValue: 'Team A' })
        : t('mp-team-b', { defaultValue: 'Team B' })}
    </span>
  );
}

/**
 * Pick a side, and — for the host — even the sides out (`N2`).
 *
 * Self-service: the host's balance control exists for the room that cannot sort
 * itself out, not as the only way in. The counts beside each side are the reason
 * the control is worth having on screen at all, because 5-v-1 is the failure
 * this mode has and it is invisible in a flat roster.
 */
function TeamControls({
  myTeam,
  isHost,
  players,
  disabled,
}: {
  myTeam: TeamId | null;
  isHost: boolean;
  players: LobbyPlayer[];
  disabled: boolean;
}) {
  const { t } = useTranslation('r-slice-it');
  const count = (team: TeamId) => players.filter((player) => player.team === team).length;

  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      {(['a', 'b'] as const).map((team) => (
        <button
          key={team}
          onClick={() => net.setTeam(team)}
          disabled={disabled}
          aria-pressed={myTeam === team}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-black uppercase tracking-widest disabled:opacity-50 ${
            myTeam === team
              ? `${TEAM_STYLES[team]} shadow-[inset_2px_2px_5px_var(--slice-shadow-dark),inset_-2px_-2px_5px_var(--slice-shadow-light)]`
              : 'bg-slice-bg text-slice-text-muted shadow-[3px_3px_6px_var(--slice-shadow-dark),-3px_-3px_6px_var(--slice-shadow-light)]'
          }`}
        >
          {team === 'a'
            ? t('mp-team-a', { defaultValue: 'Team A' })
            : t('mp-team-b', { defaultValue: 'Team B' })}
          <span className="tabular-nums opacity-70">{count(team)}</span>
        </button>
      ))}

      {isHost && (
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto text-xs font-bold text-slice-text-muted"
          onClick={() => net.balanceTeams()}
          disabled={disabled}
        >
          <Scale className="w-3.5 h-3.5 mr-1.5" aria-hidden />
          {t('mp-balance-teams', { defaultValue: 'Balance' })}
        </Button>
      )}
    </div>
  );
}

/**
 * The open ballot (`N7`).
 *
 * The countdown is rendered from `vote.closesAt` — an absolute server timestamp
 * — rather than a duration the client counts down from its own arrival time.
 * Two players whose clocks disagree would otherwise each run a perfectly smooth
 * timer and watch the vote close at two different moments, one of them
 * apparently early.
 */
function VotePanel({
  vote,
  selfSocketId,
  disabled,
  onNominate,
}: {
  vote: VoteState;
  selfSocketId: string | null;
  disabled: boolean;
  onNominate: () => void;
}) {
  const { t } = useTranslation('r-slice-it');
  const remaining = useCountdown(vote.closesAt);

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-bold text-xs text-slice-text-light uppercase tracking-widest">
          <Vote className="w-3.5 h-3.5" aria-hidden />
          {t('mp-vote-title', { defaultValue: 'Song vote' })}
        </h3>
        <span className="text-xs font-black tabular-nums text-blue-500" role="timer">
          {t('mp-vote-closes-in', { defaultValue: '{{seconds}}s left', seconds: remaining })}
        </span>
      </div>

      <ul className="space-y-2">
        {vote.nominations.length === 0 && (
          <li className="text-xs text-slice-text-light italic">
            {t('mp-vote-empty', { defaultValue: 'Nothing nominated yet.' })}
          </li>
        )}
        {vote.nominations.map((nomination) => {
          const mine = selfSocketId ? nomination.voters.includes(selfSocketId) : false;
          return (
            <li key={nomination.song.id}>
              <button
                className={`w-full flex items-center justify-between gap-3 p-3 rounded-xl text-left disabled:opacity-50 ${
                  mine
                    ? 'bg-blue-500/10 shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)]'
                    : 'bg-slice-bg shadow-[3px_3px_6px_var(--slice-shadow-dark),-3px_-3px_6px_var(--slice-shadow-light)]'
                }`}
                onClick={() => net.voteForSong(nomination.song.id)}
                disabled={disabled}
                aria-pressed={mine}
              >
                <span className="min-w-0">
                  <span className="block font-bold truncate">{nomination.song.title}</span>
                  <span className="block text-[11px] text-slice-text-muted truncate">
                    {t('mp-vote-nominated-by', {
                      defaultValue: 'by {{name}}',
                      name: nomination.nominatedBy,
                    })}
                  </span>
                </span>
                <span className="text-sm font-black tabular-nums text-blue-500 shrink-0">
                  {nomination.voters.length}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <Button
        size="sm"
        variant="outline"
        className="w-full rounded-xl"
        onClick={onNominate}
        disabled={disabled}
      >
        {t('mp-nominate-a-track', { defaultValue: 'Nominate a track' })}
      </Button>
    </section>
  );
}

/**
 * Seconds left until an absolute server deadline.
 *
 * Recomputed from `Date.now()` on every tick rather than decremented, so a tab
 * that was backgrounded — where timers are throttled to once a minute — shows
 * the truth on its first frame back instead of resuming a count that fell
 * behind while nobody was looking.
 */
function useCountdown(deadline: number): number {
  const [remaining, setRemaining] = React.useState(() =>
    Math.max(0, Math.ceil((deadline - Date.now()) / 1000)),
  );
  React.useEffect(() => {
    setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    const interval = setInterval(() => {
      setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    }, 500);
    return () => clearInterval(interval);
  }, [deadline]);
  return remaining;
}

function MultiplierBadge({ value }: { value: number }) {
  if (Math.abs(value - 1) < 0.005) return null;
  return (
    <span
      className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
        value > 1 ? 'text-green-600 bg-green-500/15' : 'text-orange-600 bg-orange-500/15'
      }`}
    >
      {value.toFixed(2)}x
    </span>
  );
}

function PlayerRow({
  player,
  isSelf,
  canKick,
  onKick,
}: {
  player: LobbyPlayer;
  isSelf: boolean;
  canKick: boolean;
  onKick: () => void;
}) {
  const { t } = useTranslation('c-game');
  return (
    <li
      className={`flex justify-between items-center gap-2 p-3 rounded-xl bg-slice-bg shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)] ${
        player.disconnected ? 'opacity-50' : ''
      }`}
    >
      <span className="flex items-center gap-2 min-w-0">
        <span
          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
            player.disconnected
              ? 'bg-amber-500 animate-pulse'
              : player.ready || player.isHost
                ? 'bg-green-500'
                : 'bg-slice-shadow-dark'
          }`}
          title={
            player.disconnected
              ? t('player-reconnecting', { defaultValue: 'Reconnecting…' })
              : player.ready
                ? t('ready', { defaultValue: 'Ready' })
                : t('not-ready', { defaultValue: 'Not ready' })
          }
        />
        <span className="font-bold text-slice-text-darker truncate">{player.name}</span>
        {isSelf && (
          <span className="text-[9px] font-black bg-blue-500 text-white px-1.5 py-0.5 rounded-full shrink-0">
            {t('you-label', { defaultValue: 'YOU' })}
          </span>
        )}
        {player.isHost && <Crown className="w-3.5 h-3.5 text-yellow-500 shrink-0" aria-hidden />}
        {player.team && <TeamBadge team={player.team} />}
        {player.spectating && (
          <span className="text-[9px] font-bold text-slice-text-light uppercase shrink-0">
            {t('spectating', { defaultValue: 'Spectating' })}
          </span>
        )}
      </span>

      <span className="flex items-center gap-1.5 shrink-0">
        <ModifierBadges modifiers={player.modifiers} />
        <MultiplierBadge value={player.scoreMultiplier} />
        {canKick && (
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0 touch-target text-slice-text-light hover:text-red-500"
            onClick={onKick}
            title={t('kick-player', { defaultValue: 'Remove from lobby' })}
            aria-label={t('kick-player', { defaultValue: 'Remove from lobby' })}
          >
            <UserX className="w-4 h-4" />
          </Button>
        )}
      </span>
    </li>
  );
}

const MODIFIER_ICONS = [
  { key: 'bombs', Icon: Bomb, className: 'text-red-400' },
  { key: 'switching', Icon: Shuffle, className: 'text-blue-400' },
  { key: 'invisible', Icon: EyeOff, className: 'text-slice-text-muted' },
  { key: 'spin', Icon: RotateCw, className: 'text-cyan-400' },
  { key: 'strictTiming', Icon: Target, className: 'text-red-500' },
  { key: 'oneTrack', Icon: Minus, className: 'text-violet-400' },
] as const;

function ModifierBadges({ modifiers }: { modifiers: Modifiers }) {
  return (
    <span className="flex items-center gap-1">
      {modifiers.difficulty !== 'normal' && (
        <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full bg-slice-shadow-dark/40 text-slice-text-darker">
          {modifiers.difficulty}
        </span>
      )}
      {modifiers.speed !== 1 && (
        <span className="text-[9px] font-bold text-purple-500">{modifiers.speed.toFixed(1)}x</span>
      )}
      {MODIFIER_ICONS.filter(({ key }) => modifiers[key]).map(({ key, Icon, className }) => (
        <Icon key={key} className={`w-3 h-3 ${className}`} aria-hidden />
      ))}
    </span>
  );
}

function ModifierPanel({
  modifiers,
  onChange,
}: {
  modifiers: Modifiers;
  onChange: (patch: Partial<Modifiers>) => void;
}) {
  const { t } = useTranslation('c-game');

  const levels = [
    { key: 'easy', label: t('easy', { defaultValue: 'Easy' }), notes: '70%', color: '#22c55e' },
    {
      key: 'normal',
      label: t('normal', { defaultValue: 'Normal' }),
      notes: '100%',
      color: '#3b82f6',
    },
    { key: 'hard', label: t('hard', { defaultValue: 'Hard' }), notes: '150%', color: '#f97316' },
    {
      key: 'expert',
      label: t('expert', { defaultValue: 'Expert' }),
      notes: '200%',
      color: '#ef4444',
    },
  ] as const;

  const toggles = [
    {
      key: 'bombs',
      label: t('bombs', { defaultValue: 'Bombs' }),
      Icon: Bomb,
      desc: t('desc-bombs', { defaultValue: 'Adds bomb notes to avoid' }),
    },
    {
      key: 'switching',
      label: t('switching', { defaultValue: 'Switching' }),
      Icon: Shuffle,
      desc: t('desc-switching', { defaultValue: 'Adds lane-switch notes' }),
    },
    {
      key: 'invisible',
      label: t('invisible', { defaultValue: 'Invisible' }),
      Icon: EyeOff,
      desc: t('desc-invisible', { defaultValue: 'Notes fade before hit line' }),
    },
    {
      key: 'spin',
      label: t('spin', { defaultValue: 'Spin' }),
      Icon: RotateCw,
      desc: t('desc-spin', { defaultValue: 'Playfield rotates during gameplay' }),
    },
    {
      key: 'strictTiming',
      label: t('strict-timing', { defaultValue: 'Strict Timing' }),
      Icon: Target,
      desc: t('desc-strict-timing', { defaultValue: 'Tighter hit windows' }),
    },
    {
      key: 'oneTrack',
      label: t('one-track', { defaultValue: 'One Track' }),
      Icon: Minus,
      desc: t('desc-one-track', { defaultValue: 'All notes on a single lane' }),
    },
  ] as const;

  return (
    <div className="bg-slice-bg p-4 rounded-xl shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)] space-y-3">
      <div className="space-y-1.5">
        <span className="text-xs font-bold text-slice-text-darker">
          {t('note-density', { defaultValue: 'Note Density' })}
        </span>
        <div className="grid grid-cols-4 gap-1">
          {levels.map((level) => {
            const active = modifiers.difficulty === level.key;
            return (
              <button
                key={level.key}
                onClick={() => onChange({ difficulty: level.key })}
                aria-pressed={active}
                className={`px-1.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wide border ${
                  active
                    ? 'text-white shadow-md'
                    : 'bg-slice-bg text-slice-text-light border-slice-shadow-dark/50 shadow-[2px_2px_4px_var(--slice-shadow-dark),-2px_-2px_4px_var(--slice-shadow-light)]'
                }`}
                style={
                  active ? { backgroundColor: level.color, borderColor: level.color } : undefined
                }
              >
                <span className="block">{level.label}</span>
                <span
                  className={`block text-[9px] font-normal mt-0.5 ${
                    active ? 'text-white/80' : 'text-slice-text-muted'
                  }`}
                >
                  {level.notes}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-xs font-bold text-slice-text-darker">
            <Zap className="w-4 h-4 text-purple-500" aria-hidden />
            {t('speed', { defaultValue: 'Speed' })}
          </span>
          <span className="text-sm font-bold text-purple-500 font-mono">
            {modifiers.speed.toFixed(1)}x
          </span>
        </div>
        <Slider
          value={[modifiers.speed]}
          // Multiplayer floors speed at 1.0x: a slower chart in a race is a free
          // easy mode, and the multiplier only ever rewards going faster.
          min={MULTIPLAYER_MIN_SPEED}
          max={MAX_SPEED}
          step={0.1}
          onValueChange={([v]) => onChange({ speed: Number(v.toFixed(1)) })}
          aria-label={t('speed', { defaultValue: 'Speed' })}
        />
      </div>

      {toggles.map(({ key, label, Icon, desc }) => (
        <button
          key={key}
          aria-pressed={modifiers[key]}
          className={`flex items-center justify-between w-full p-2 rounded-lg ${
            modifiers[key]
              ? 'bg-blue-500/10 shadow-[inset_2px_2px_4px_var(--slice-shadow-dark),inset_-2px_-2px_4px_var(--slice-shadow-light)]'
              : 'bg-slice-bg shadow-[2px_2px_4px_var(--slice-shadow-dark),-2px_-2px_4px_var(--slice-shadow-light)]'
          }`}
          onClick={() => onChange({ [key]: !modifiers[key] } as Partial<Modifiers>)}
        >
          <span className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-slice-text-muted" aria-hidden />
            <span className="text-xs font-bold text-slice-text-darker">{label}</span>
            <span className="text-slice-text-light" title={desc}>
              <Info className="w-3 h-3" aria-hidden />
            </span>
          </span>
          <span
            className={`w-8 h-5 rounded-full relative ${
              modifiers[key] ? 'bg-blue-500' : 'bg-slice-shadow-dark'
            }`}
            aria-hidden
          >
            <span
              className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                modifiers[key] ? 'translate-x-3.5' : 'translate-x-0.5'
              }`}
            />
          </span>
        </button>
      ))}
    </div>
  );
}

function LobbyChat({
  chat,
  draft,
  onDraft,
  onSend,
}: {
  chat: { id: string; name: string; text: string }[];
  draft: string;
  onDraft: (value: string) => void;
  onSend: () => void;
}) {
  const { t } = useTranslation('c-game');
  const endRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [chat.length]);

  return (
    <section className="space-y-2">
      <h3 className="font-bold text-xs text-slice-text-light uppercase tracking-widest">
        {t('lobby-chat', { defaultValue: 'Chat' })}
      </h3>
      <div className="h-28 overflow-y-auto rounded-xl bg-slice-bg p-3 space-y-1 shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)]">
        {chat.length === 0 ? (
          <p className="text-xs text-slice-text-light italic">
            {t('chat-empty', { defaultValue: 'Say hello…' })}
          </p>
        ) : (
          chat.map((message) => (
            <p key={message.id} className="text-xs">
              <span className="font-bold text-slice-text-darker">{message.name}</span>
              <span className="text-slice-text-muted"> {message.text}</span>
            </p>
          ))
        )}
        <div ref={endRef} />
      </div>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSend();
          }}
          maxLength={300}
          placeholder={t('chat-placeholder', { defaultValue: 'Message the lobby…' })}
          className="h-9 text-sm bg-(--slice-input-bg) border-(--slice-input-border) rounded-lg"
          aria-label={t('lobby-chat', { defaultValue: 'Chat' })}
        />
        <Button
          size="icon"
          className="h-9 w-9 shrink-0 rounded-lg"
          onClick={onSend}
          disabled={!draft.trim()}
          aria-label={t('send', { defaultValue: 'Send' })}
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </section>
  );
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * @param t the shared `c-game` namespace, where the original lobby errors live.
 * @param ts the game's own `r-slice-it` namespace, where this wave's do (`N2`,
 *   `N7`). Two translators rather than one because moving the existing keys
 *   would retranslate them in sixteen locales to say the same thing.
 */
function errorMessage(
  code: string,
  t: (key: string, opts: { defaultValue: string }) => string,
  ts: (key: string, opts: { defaultValue: string }) => string,
): string {
  switch (code) {
    case 'not_found':
      return t('err-lobby-not-found', { defaultValue: 'No lobby with that code.' });
    case 'full':
      return t('err-lobby-full', { defaultValue: 'That lobby is full.' });
    case 'in_progress':
      return t('err-in-progress', { defaultValue: 'That match has already started.' });
    case 'not_host':
      return t('err-not-host', { defaultValue: 'Only the host can do that.' });
    case 'no_song':
      return t('err-no-song', { defaultValue: 'Pick a track first.' });
    case 'too_few_players':
      return t('err-too-few', { defaultValue: 'Not everyone is ready yet.' });
    case 'auth_required':
      return t('err-auth', { defaultValue: 'Sign in to play multiplayer.' });
    case 'rate_limited':
      return t('err-rate-limited', { defaultValue: 'Slow down a moment.' });
    case 'lobby_limit':
      return t('err-lobby-limit', {
        defaultValue: 'Too many lobbies right now. Try again shortly.',
      });
    case 'song_unavailable':
      return t('err-song-gone', { defaultValue: 'That track is no longer available.' });
    case 'vote_closed':
      return ts('mp-err-vote-closed', { defaultValue: 'That vote has already closed.' });
    case 'teams_disabled':
      return ts('mp-err-teams-off', { defaultValue: 'This lobby is not in team mode.' });
    default:
      return t('err-generic', { defaultValue: 'Something went wrong.' });
  }
}
