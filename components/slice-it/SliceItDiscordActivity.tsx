'use client';

/**
 * Slice It! as a Discord Activity (X9), including the guest identity split
 * (X10, client half).
 *
 * ## The channel IS the lobby
 *
 * `lobbyCodeFromChannel()` turns the Discord channel id into a stable code so
 * everyone who opens the Activity from the same voice channel converges on one
 * session with nothing typed. It is a *pairing* code, not a *server* code —
 * `slice:create` mints its own random one and has no way to be told "use this
 * code instead" (see the handoff note in `docs/_handoff/discord-requests.md`).
 * Until that exists, this component gets the same result a different way: the
 * first participant to fail a join for the derived code creates a real lobby;
 * everyone else just keeps retrying the (still-derived) code until that lobby
 * exists and their retry succeeds. One extra round trip, same outcome.
 *
 * ## Guests
 *
 * `discord.linkedUserId` says whether this Discord account is tied to an
 * rmhstudios.com account — but it is NOT the same fact as "this browser has a
 * signed-in session right now", which is what the multiplayer socket actually
 * checks (`net.connectSliceIt()` reads a Better Auth session token, same as
 * the standalone `/slice-it` page). Inside the Discord iframe that session is
 * commonly absent even for a linked account — so this component tracks the two
 * facts separately: `isGuest` (display only — the badge, the copy) and
 * `multiplayerAvailable` (does the socket actually work). A guest with a
 * session and a linked account without one land in different UI states for
 * different, honest reasons.
 *
 * Nothing about a guest identity is written anywhere: no store field, no
 * fetch, no localStorage key. The Discord name and avatar exist only in this
 * component's own state for the lifetime of the tab.
 */

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Headphones, Loader2, UserRound, X } from 'lucide-react';
import { discordAvatarUrl, setActivityStatus, type DiscordContext } from '@/lib/discord-sdk';
import { outputLatencyMs } from '@/lib/shared/platform';
import { SITE_URL } from '@/lib/seo';
import { LOBBY_CODE_LENGTH } from '@/lib/slice-it/constants';
import { useSliceItStore } from '@/lib/slice-it/store';
import * as net from '@/lib/slice-it/net/client';
import type { LobbyErrorCode } from '@/lib/slice-it/net/events';
import { DarkModeWrapper } from '@/components/slice-it/DarkModeWrapper';
import { CalibrationScreen } from '@/components/slice-it/CalibrationScreen';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';
import sliceItCss from '@/components/slice-it/slice-it.css?url';

const GameCanvas = lazy(() =>
  import('@/components/slice-it/GameCanvas').then((m) => ({ default: m.GameCanvas })),
);

interface Props {
  discord: DiscordContext;
  /** Returns to the gateway's picker. Omitted when mounted standalone. */
  onExit?: () => void;
}

/* ─── Channel → lobby code ──────────────────────────────────────────────── */

// Mirrors server/socket-server/config.ts's ROOM_CODE_ALPHABET (no 0/O/1/I) so
// a derived code looks like every other lobby code in the UI. It does not have
// to match byte-for-byte — this alphabet is a display convention, not a
// contract the server checks.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** xorshift32 — cheap, deterministic re-mixing so a multi-character code isn't
 *  just the low bits of one 32-bit hash read out in different bases. */
function mix(n: number): number {
  n ^= n << 13;
  n >>>= 0;
  n ^= n >>> 17;
  n ^= n << 5;
  n >>>= 0;
  return n >>> 0;
}

/**
 * A stable, deterministic code derived from a Discord channel (or, lacking
 * one, the Activity instance) id. Every client in the same voice channel
 * computes the same string with no coordination required.
 */
export function lobbyCodeFromChannel(channelId: string): string {
  let h = fnv1a(channelId) || 1; // xorshift needs a non-zero seed
  let out = '';
  for (let i = 0; i < LOBBY_CODE_LENGTH; i++) {
    h = mix(h);
    out += CODE_ALPHABET[h % CODE_ALPHABET.length];
  }
  return out;
}

/* ─── Pairing state machine ─────────────────────────────────────────────── */

type Phase = 'connecting' | 'pairing' | 'waiting-for-host' | 'ready' | 'solo';

const LATENCY_HINT_THRESHOLD_MS = 120;
const LATENCY_POLL_MS = 2000;
const WAITING_RETRY_MS = 4000;

function pairingErrorNote(code: LobbyErrorCode, t: ReturnType<typeof useTranslation>['t']): string {
  switch (code) {
    case 'full':
      return t('pairing-full', {
        defaultValue: "This channel's lobby is full (8 players) — playing solo.",
      });
    case 'rate_limited':
      return t('pairing-rate-limited', {
        defaultValue: 'Too many attempts too fast — playing solo for now.',
      });
    default:
      return t('pairing-failed-generic', {
        defaultValue: "Couldn't join the group lobby — playing solo.",
      });
  }
}

/* ─── Component ──────────────────────────────────────────────────────────── */

export function SliceItDiscordActivity({ discord, onExit }: Props) {
  const { t } = useTranslation('r-slice-it');

  const isGuest = !discord.linkedUserId;
  const displayName = discord.user.global_name || discord.user.username;
  const avatarUrl = useMemo(() => discordAvatarUrl(discord.user), [discord.user]);

  const code = useMemo(
    () => lobbyCodeFromChannel(discord.channelId ?? discord.sdk.instanceId),
    [discord.channelId, discord.sdk.instanceId],
  );
  // Same convention the gateway picker uses for "who opened this Activity" —
  // see lib/discord-sdk.ts for why `participants` has to be the live roster.
  const isLauncher = discord.participants[0]?.id === discord.user.id;

  const [phase, setPhase] = useState<Phase>('connecting');
  const [multiplayerAvailable, setMultiplayerAvailable] = useState(false);
  const [pairingNote, setPairingNote] = useState<string | null>(null);
  const [showCalibration, setShowCalibration] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [latencyDismissed, setLatencyDismissed] = useState(false);

  const lobby = useSliceItStore((s) => s.lobby);
  const lobbyError = useSliceItStore((s) => s.lobbyError);
  const gameStatus = useSliceItStore((s) => s.status);
  const isMultiplayer = useSliceItStore((s) => s.isMultiplayer);

  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  /* ── Step 1: is the multiplayer socket even reachable this session? ── */
  useEffect(() => {
    let cancelled = false;
    net
      .connectSliceIt()
      .then(() => {
        if (cancelled) return;
        setMultiplayerAvailable(true);
        setPhase('pairing');
      })
      .catch(() => {
        if (!cancelled) setPhase('solo');
      });
    return () => {
      cancelled = true;
    };
    // Intentionally once: connectSliceIt() reuses its existing client on a
    // second call, so a re-run here would only be wasted work, not a retry.
  }, []);

  /* ── Step 2: the first join attempt against the derived code ── */
  const joinedOnceRef = useRef(false);
  useEffect(() => {
    if (phase !== 'pairing' || joinedOnceRef.current) return;
    joinedOnceRef.current = true;
    net.joinLobby(code);
  }, [phase, code]);

  /* ── Step 3: react to what the server said ── */
  useEffect(() => {
    if (phase !== 'pairing' && phase !== 'waiting-for-host') return;
    if (lobby) {
      setPhase('ready');
      return;
    }
    if (!lobbyError) return;

    // Consumed here so it never surfaces again once GameCanvas mounts and
    // MultiplayerLobby's own lobbyError effect starts watching the same
    // store field — this error was this component's to resolve.
    useSliceItStore.getState().setLobbyError(null);

    if (lobbyError === 'not_found') {
      if (isLauncher) {
        // Private: nothing about a Discord voice channel's session
        // should be discoverable through quickplay/browse.
        net.createLobby(false);
      } else {
        setPhase('waiting-for-host');
      }
      return;
    }

    if (lobbyError === 'auth_required') {
      setPhase('solo');
      return;
    }

    setPairingNote(pairingErrorNote(lobbyError as LobbyErrorCode, t));
    setPhase('solo');
  }, [phase, lobby, lobbyError, isLauncher, t]);

  /* ── Step 4: keep retrying while waiting on the host to create it ── */
  useEffect(() => {
    if (phase !== 'waiting-for-host') return;
    const id = setInterval(() => net.joinLobby(code), WAITING_RETRY_MS);
    return () => clearInterval(id);
  }, [phase, code]);

  /* ── Give up the pairing socket for good on true unmount, unless a match
   *     is already using it. ── */
  useEffect(() => {
    return () => {
      if (phaseRef.current !== 'ready') net.disconnectSliceIt();
    };
  }, []);

  const goSolo = useCallback(() => {
    net.disconnectSliceIt();
    setPairingNote(null);
    setPhase('solo');
  }, []);

  const handleExit = useCallback(() => {
    // A seated player leaving the socket open behind them would sit in the
    // room as a disconnected seat until the grace window expires — the same
    // "close the tab" cleanup MultiplayerLobby's own leave button does.
    if (phaseRef.current === 'ready') {
      net.leaveLobby();
      net.disconnectSliceIt();
    }
    onExit?.();
  }, [onExit]);

  /* ── Rich presence ── */
  useEffect(() => {
    if (phase !== 'ready' && phase !== 'solo') return;
    const partySize =
      discord.participants.length > 1
        ? ([discord.participants.length, 8] as [number, number])
        : undefined;

    let state: string;
    if (phase === 'solo' && !isMultiplayer) {
      state =
        gameStatus === 'PLAYING'
          ? t('presence-solo-playing', { defaultValue: 'Playing solo' })
          : t('presence-solo-browsing', { defaultValue: 'Choosing a track' });
    } else {
      state =
        lobby?.state === 'playing' || lobby?.state === 'countdown'
          ? t('presence-playing', { defaultValue: 'Playing with the group' })
          : lobby?.state === 'results'
            ? t('presence-results', { defaultValue: 'Looking at the results' })
            : t('presence-waiting', { defaultValue: 'In the lobby' });
    }

    setActivityStatus(discord.sdk, state, { partySize, imageLabel: 'Slice It!' });
  }, [phase, lobby?.state, gameStatus, isMultiplayer, discord.sdk, discord.participants.length, t]);

  /* ── A6: output-latency calibration hint ── */
  useEffect(() => {
    if ((phase !== 'ready' && phase !== 'solo') || latencyDismissed) return;
    const check = () => {
      const ms = outputLatencyMs();
      if (ms !== null) setLatencyMs(ms);
    };
    check();
    const id = setInterval(check, LATENCY_POLL_MS);
    return () => clearInterval(id);
  }, [phase, latencyDismissed]);

  const showLatencyHint =
    latencyMs !== null && latencyMs > LATENCY_HINT_THRESHOLD_MS && !latencyDismissed;

  const handleLinkAccount = useCallback(() => {
    // A plain in-iframe navigation to /login would just bounce straight
    // back to /discord — __root.tsx forces every non-/discord/* path back
    // while isDiscordActivity() is true. Signing in has to happen in a real
    // browser tab, which is exactly what openExternalLink is for.
    void discord.sdk.commands.openExternalLink({
      url: `${SITE_URL}/login?callbackURL=%2Fdiscord`,
    });
  }, [discord.sdk]);

  const showEndOfMatchNotice = gameStatus === 'FINISHED' && !multiplayerAvailable;
  const isPairing = phase === 'connecting' || phase === 'pairing' || phase === 'waiting-for-host';

  // Both branches below use `.slice-theme` token classes (`bg-slice-bg`,
  // `text-slice-text`, …), so the stylesheet that defines those custom
  // properties has to be mounted before either renders — not only in the
  // 'ready'/'solo' branch, or the pairing screen paints with every one of
  // them resolving to nothing.
  return (
    <DarkModeWrapper>
      <link rel="stylesheet" href={sliceItCss} />
      {isPairing ? (
        <div className="slice-theme min-h-dvh w-full flex items-center justify-center bg-slice-bg p-4">
          <div className="w-full max-w-sm text-center">
            <IdentityChip
              avatarUrl={avatarUrl}
              displayName={displayName}
              isGuest={isGuest}
              compact
            />
            <div className="mt-6 mb-4 flex justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" aria-hidden />
            </div>
            <p className="text-slice-text font-semibold mb-1">
              {phase === 'connecting' &&
                t('phase-connecting', { defaultValue: 'Connecting to the multiplayer server…' })}
              {phase === 'pairing' &&
                t('phase-pairing', { defaultValue: "Finding this voice channel's lobby…" })}
              {phase === 'waiting-for-host' &&
                t('phase-waiting-for-host', {
                  defaultValue: 'Waiting for the session to start…',
                })}
            </p>
            <p className="text-slice-text-muted text-xs mb-6">
              {t('pairing-code-hint', { defaultValue: 'Shared lobby code: {{code}}', code })}
            </p>
            <button
              type="button"
              onClick={goSolo}
              className="text-xs font-bold uppercase tracking-wide text-slice-text-muted hover:text-slice-text underline underline-offset-2"
            >
              {t('play-solo-instead', { defaultValue: 'Play Solo Instead' })}
            </button>
          </div>
        </div>
      ) : (
        <div
          className="slice-theme relative h-dvh w-full flex flex-col overflow-hidden bg-slice-bg text-slate-700 dark:text-slate-200 transition-colors duration-300"
          style={{ fontFamily: '"Outfit", sans-serif' }}
        >
          <header className="shrink-0 flex flex-col z-40 border-b border-slice-shadow-dark/30 bg-slice-bg">
            <div className="flex items-center justify-between gap-3 px-3 py-2">
              <IdentityChip avatarUrl={avatarUrl} displayName={displayName} isGuest={isGuest} />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowCalibration(true)}
                  className="text-[11px] font-bold uppercase tracking-wide text-slice-text-muted hover:text-slice-text px-2 py-1 rounded-lg"
                >
                  {t('calibrate', { defaultValue: 'Calibrate' })}
                </button>
                {onExit && (
                  <button
                    type="button"
                    onClick={handleExit}
                    aria-label={t('back-to-games', { defaultValue: 'Back to games' })}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-slice-shadow-dark/20 text-slice-text-muted hover:text-slice-text"
                  >
                    <X className="w-4 h-4" aria-hidden />
                  </button>
                )}
              </div>
            </div>

            {showLatencyHint && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border-t border-amber-500/20 text-amber-500 text-[11px]">
                <Headphones className="w-3.5 h-3.5 shrink-0" aria-hidden />
                <span className="flex-1">
                  {t('calibration-hint', {
                    defaultValue:
                      'Your audio adds about {{ms}}ms — wired headphones will feel tighter, or ',
                    ms: latencyMs,
                  })}
                  <button
                    type="button"
                    onClick={() => setShowCalibration(true)}
                    className="underline underline-offset-2 font-bold"
                  >
                    {t('calibrate-now', { defaultValue: 'calibrate now' })}
                  </button>
                  .
                </span>
                <button
                  type="button"
                  onClick={() => setLatencyDismissed(true)}
                  aria-label={t('dismiss', { defaultValue: 'Dismiss' })}
                  className="shrink-0"
                >
                  <X className="w-3.5 h-3.5" aria-hidden />
                </button>
              </div>
            )}

            {pairingNote && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-slice-shadow-dark/10 text-slice-text-muted text-[11px]">
                <span className="flex-1">{pairingNote}</span>
                <button
                  type="button"
                  onClick={() => setPairingNote(null)}
                  aria-label={t('dismiss', { defaultValue: 'Dismiss' })}
                >
                  <X className="w-3.5 h-3.5" aria-hidden />
                </button>
              </div>
            )}

            {showEndOfMatchNotice && (
              <div className="flex flex-wrap items-center gap-2 px-3 py-1.5 bg-blue-500/10 border-t border-blue-500/20 text-blue-500 text-[11px]">
                <span className="flex-1">
                  {isGuest
                    ? t('guest-score-not-saved', {
                        defaultValue: 'Playing as a guest — this score was not saved.',
                      })
                    : t('linked-session-not-saved', {
                        defaultValue:
                          "Signed in as {{name}} on Discord, but this session isn't connected to your rmhstudios.com account — this score was not saved.",
                        name: displayName,
                      })}
                </span>
                <button
                  type="button"
                  onClick={handleLinkAccount}
                  className="shrink-0 underline underline-offset-2 font-bold"
                >
                  {isGuest
                    ? t('link-discord', {
                        defaultValue: 'Link your Discord account to keep scores',
                      })
                    : t('sign-in-to-sync', { defaultValue: 'Sign in to sync scores' })}
                </button>
              </div>
            )}
          </header>

          <div className="flex-1 min-h-0 w-full relative">
            <GameErrorBoundary gameName="Slice It">
              <Suspense
                fallback={
                  <GameLoadingFallback
                    background="var(--slice-bg, #000000)"
                    foreground="var(--slice-text, #ffffff)"
                  />
                }
              >
                <GameCanvas />
              </Suspense>
            </GameErrorBoundary>
          </div>

          {showCalibration && <CalibrationScreen onBack={() => setShowCalibration(false)} />}
        </div>
      )}
    </DarkModeWrapper>
  );
}

/* ─── Identity chip ──────────────────────────────────────────────────────── */

function IdentityChip({
  avatarUrl,
  displayName,
  isGuest,
  compact,
}: {
  avatarUrl: string;
  displayName: string;
  isGuest: boolean;
  compact?: boolean;
}) {
  const { t } = useTranslation('r-slice-it');
  return (
    <div
      className={compact ? 'flex flex-col items-center gap-2' : 'flex items-center gap-2 min-w-0'}
    >
      <img
        src={avatarUrl}
        alt=""
        aria-hidden
        className={compact ? 'w-12 h-12 rounded-full mx-auto' : 'w-8 h-8 rounded-full shrink-0'}
      />
      <div className={compact ? 'flex flex-col items-center' : 'flex flex-col min-w-0'}>
        <span className="font-bold text-slice-text text-sm truncate">{displayName}</span>
        {isGuest ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-amber-500">
            <UserRound className="w-3 h-3" aria-hidden />
            {t('guest-badge', { defaultValue: 'Guest' })}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-emerald-500">
            <Check className="w-3 h-3" aria-hidden />
            {t('linked-badge', { defaultValue: 'Linked' })}
          </span>
        )}
      </div>
    </div>
  );
}
