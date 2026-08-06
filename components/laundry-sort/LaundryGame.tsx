'use client';

/**
 * Laundry Sort — game root.
 *
 * Owns the match object, the screen the player is on, and the two things that
 * leave the browser: the solo score POST and the versus score stream.
 *
 * The match itself lives in a ref, not in state. It mutates 60 times a second
 * and nothing above the canvas should re-render when it does — the HUD reads it
 * imperatively (`HudReadout`), and React only hears about discrete events:
 * a garment resolved, a round ended, a lobby changed.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouterState } from '@tanstack/react-router';
import { toast } from 'sonner';
import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSession } from '@/components/Providers';
import { ConnectionBanner } from '@/components/shared/ConnectionStatus';
import { useLobbyInviteJoin } from '@/hooks/useLobbyLink';
import { SCORE_PUBLISH_MS } from '@/lib/laundry-sort/constants';
import { LaundryMatch, type MatchEvent } from '@/lib/laundry-sort/match';
import { randomSeed } from '@/lib/laundry-sort/rng';
import { useLaundryStore } from '@/lib/laundry-sort/store';
import {
  connectLaundry,
  disconnectLaundry,
  laundryNet,
  reconnectNow,
} from '@/lib/laundry-sort/net/client';
import type { PartyTicketMsg } from '@/lib/party/types';
import { AspectStage } from './AspectStage';
import { GameCanvas } from './GameCanvas';
import { HudReadout } from './hud/HudReadout';
import { MainMenu } from './hud/MainMenu';
import { BrowsePanel, LobbyPanel, lobbyErrorMessage } from './hud/LobbyPanel';
import { ResultsPanel } from './hud/ResultsPanel';
import { RotateHint } from './hud/RotateHint';
import { ScorePopups, popupsFromEvents, type Popup } from './hud/ScorePopups';
import { VersusTicker } from './hud/VersusTicker';
import { WashLegend } from './hud/WashLegend';
import './laundry.css';

export function LaundryGame() {
  const { t } = useTranslation('c-laundry-sort');
  const { data: session } = useSession();
  const signedIn = Boolean(session?.user?.id);

  const matchRef = useRef<LaundryMatch | null>(null);
  const [popups, setPopups] = useState<Popup[]>([]);
  const [leaderboardKey, setLeaderboardKey] = useState(0);
  const [contextLost, setContextLost] = useState(false);
  const [connecting, setConnecting] = useState(false);
  /** Our own clock ran out but the server has not published standings yet. */
  const [awaitingResults, setAwaitingResults] = useState(false);

  const screen = useLaundryStore((s) => s.screen);
  const mode = useLaundryStore((s) => s.mode);
  const start = useLaundryStore((s) => s.start);
  const countdown = useLaundryStore((s) => s.countdown);
  const connection = useLaundryStore((s) => s.connection);
  const error = useLaundryStore((s) => s.error);

  const running = screen === 'playing';

  // ── Connection ────────────────────────────────────────────────────────────

  const ensureConnected = useCallback(async (): Promise<boolean> => {
    setConnecting(true);
    try {
      await connectLaundry();
      return true;
    } catch {
      toast.error(t('error-connect', { defaultValue: 'Could not reach the game server.' }));
      return false;
    } finally {
      setConnecting(false);
    }
  }, [t]);

  useEffect(() => () => disconnectLaundry(), []);

  // A party leader queued this game, so the hub minted us a seat ticket. It
  // arrives in router state (never the URL — it is a bearer secret).
  const partyTicket = useRouterState({
    select: (state) =>
      (state.location.state as { partyTicket?: PartyTicketMsg } | undefined)?.partyTicket,
  });

  useEffect(() => {
    if (!partyTicket?.token || !signedIn) return;
    let cancelled = false;
    void (async () => {
      const ok = await ensureConnected();
      if (ok && !cancelled) laundryNet.ticket(partyTicket.token);
    })();
    return () => {
      cancelled = true;
    };
  }, [partyTicket, signedIn, ensureConnected]);

  // An invite link instead of a code read out over voice chat. Same join the
  // menu makes, so a full or expired lobby fails the same way it always did.
  useLobbyInviteJoin(signedIn, (code) => {
    void (async () => {
      if (await ensureConnected()) laundryNet.join(code.toUpperCase());
    })();
  });

  // ── Errors ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!error) return;
    // The lobby renders its error inline; everywhere else needs a toast, or a
    // failed join looks like a dead button.
    if (screen !== 'lobby') toast.error(lobbyErrorMessage(error, t));
    const timer = window.setTimeout(() => useLaundryStore.getState().setError(null), 5000);
    return () => window.clearTimeout(timer);
  }, [error, screen, t]);

  // ── Starting a round ──────────────────────────────────────────────────────

  const startSolo = useCallback(() => {
    const state = useLaundryStore.getState();
    matchRef.current = new LaundryMatch({
      seed: randomSeed(),
      durationSec: state.durationSec,
      difficulty: state.difficulty,
    });
    setPopups([]);
    setAwaitingResults(false);
    state.setMode('solo');
    state.setSoloResult(null);
    state.setResults(null);
    state.setScreen('playing');
  }, []);

  // Versus rounds start when the server says so, on the seed it chose — that
  // single number is what guarantees both players get identical laundry.
  useEffect(() => {
    if (!start) return;
    matchRef.current = new LaundryMatch({
      seed: start.seed,
      durationSec: start.durationSec,
      difficulty: start.difficulty,
    });
    setPopups([]);
    setAwaitingResults(false);
  }, [start]);

  // ── Publishing a running score (versus only) ─────────────────────────────

  useEffect(() => {
    if (!running || mode !== 'versus') return;
    const id = window.setInterval(() => {
      const match = matchRef.current;
      if (!match || match.finished) return;
      laundryNet.score({
        score: match.stats.score,
        combo: match.stats.combo,
        sorted: match.stats.sorted,
        wrong: match.stats.wrong,
        missed: match.stats.missed,
        bestCombo: match.stats.bestCombo,
      });
    }, SCORE_PUBLISH_MS);
    return () => window.clearInterval(id);
  }, [running, mode]);

  // ── Round end ─────────────────────────────────────────────────────────────

  const submitSolo = useCallback(async (match: LaundryMatch) => {
    const store = useLaundryStore.getState();
    store.patchSoloResult({ submitted: 'pending' });
    try {
      const response = await fetch('/api/laundry-sort/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          score: match.stats.score,
          sorted: match.stats.sorted,
          wrong: match.stats.wrong,
          missed: match.stats.missed,
          bestCombo: match.stats.bestCombo,
          durationSec: match.options.durationSec,
          difficulty: match.options.difficulty,
        }),
      });
      if (!response.ok) throw new Error(String(response.status));
      const data = (await response.json()) as { personalBest?: boolean };
      useLaundryStore
        .getState()
        .patchSoloResult({ submitted: 'done', personalBest: Boolean(data.personalBest) });
      setLeaderboardKey((key) => key + 1);
    } catch {
      useLaundryStore.getState().patchSoloResult({ submitted: 'error' });
    }
  }, []);

  const handleFinished = useCallback(() => {
    const match = matchRef.current;
    if (!match) return;
    const store = useLaundryStore.getState();

    const report = {
      score: match.stats.score,
      combo: match.stats.combo,
      sorted: match.stats.sorted,
      wrong: match.stats.wrong,
      missed: match.stats.missed,
      bestCombo: match.stats.bestCombo,
    };

    if (store.mode === 'versus') {
      laundryNet.finish(report);
      // The server owns the standings, so hold here until it publishes them
      // rather than guessing a placement the room might disagree with.
      setAwaitingResults(true);
      return;
    }

    store.setSoloResult({
      stats: { ...match.stats },
      durationSec: match.options.durationSec,
      difficulty: match.options.difficulty,
      submitted: 'idle',
      personalBest: false,
    });
    store.setScreen('results');
    void submitSolo(match);
  }, [submitSolo]);

  // The server's standings supersede the local wait.
  useEffect(() => {
    if (screen === 'results') setAwaitingResults(false);
  }, [screen]);

  const handleEvents = useCallback((events: MatchEvent[]) => {
    setPopups(popupsFromEvents(events));
  }, []);

  // A pointer that is still down when the tab is hidden would otherwise leave a
  // garment welded to a grip that never releases.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') matchRef.current?.endGrab();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, []);

  // ── Menu actions ──────────────────────────────────────────────────────────

  const withConnection = useCallback(
    (action: () => void) => async () => {
      if (await ensureConnected()) action();
    },
    [ensureConnected],
  );

  const leaveLobby = useCallback(() => {
    laundryNet.leave();
    const store = useLaundryStore.getState();
    store.setLobby(null);
    store.setMode('solo');
    store.setScreen('menu');
  }, []);

  const backToMenu = useCallback(() => {
    const store = useLaundryStore.getState();
    matchRef.current = null;
    setAwaitingResults(false);
    if (store.mode === 'versus' && store.lobby) {
      store.setScreen('lobby');
      store.setResults(null);
    } else {
      store.leaveMatch();
    }
  }, []);

  const playAgain = useCallback(() => {
    const store = useLaundryStore.getState();
    if (store.mode === 'versus') {
      store.setResults(null);
      store.setScreen('lobby');
      return;
    }
    startSolo();
  }, [startSolo]);

  return (
    <div className="laundry-root ls-letterbox absolute inset-0 overscroll-none">
      <AspectStage>
        <GameCanvas
          matchRef={matchRef}
          running={running && !awaitingResults}
          onEvents={handleEvents}
          onFinished={handleFinished}
          onContextLost={() => setContextLost(true)}
          onContextRestored={() => setContextLost(false)}
        />

        {running ? (
          <>
            <HudReadout matchRef={matchRef} running={running && !awaitingResults} />
            <ScorePopups popups={popups} />
            {mode === 'versus' ? <VersusTicker /> : null}
            <div className="ls-legend pointer-events-none absolute inset-x-0 bottom-1.5 z-30 flex justify-center px-2">
              <div className="ls-panel px-2.5 py-1.5">
                <WashLegend compact />
              </div>
            </div>
          </>
        ) : null}

        {countdown !== null && screen !== 'lobby' ? (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/50">
            <p className="ls-accent text-7xl font-black" role="status" aria-live="assertive">
              {countdown}
            </p>
          </div>
        ) : null}

        {awaitingResults ? (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
            <p className="ls-panel-strong px-5 py-4 text-center text-sm" role="status">
              {t('waiting-for-others', {
                defaultValue: 'Your round is done — waiting for the rest of the room.',
              })}
            </p>
          </div>
        ) : null}

        {contextLost ? (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
            <p className="ls-panel-strong px-5 py-4 text-center text-sm" role="alert">
              {t('context-lost', {
                defaultValue:
                  'The browser reset this page’s graphics. It should come back on its own — reload if it does not.',
              })}
            </p>
          </div>
        ) : null}
      </AspectStage>

      {/*
        Menus live OUTSIDE the aspect lock, on the full viewport.
        The 16:9 frame exists so nobody sees more *arena* than anyone else —
        that is a fairness rule about the playfield, and it has nothing to say
        about a settings panel. Nesting the menus inside it squeezed the whole
        front screen into a 219px-tall band on a phone held in portrait, which
        put the start button off the bottom of a strip nobody could scroll.
      */}
      {running ? null : (
        <>
          {screen === 'menu' ? (
            <MainMenu
              signedIn={signedIn}
              connecting={connecting}
              leaderboardKey={leaderboardKey}
              onSolo={startSolo}
              onQuickMatch={withConnection(() => laundryNet.quickplay())}
              onCreateLobby={withConnection(() => {
                const state = useLaundryStore.getState();
                laundryNet.create({
                  isPublic: true,
                  durationSec: state.durationSec,
                  difficulty: state.difficulty,
                });
              })}
              onJoinCode={(code) => void withConnection(() => laundryNet.join(code))()}
              onBrowse={withConnection(() => {
                const state = useLaundryStore.getState();
                state.setBrowsing(true);
                state.setScreen('browse');
                laundryNet.browse();
              })}
            />
          ) : null}

          {screen === 'browse' ? (
            <BrowsePanel onBack={() => useLaundryStore.getState().setScreen('menu')} />
          ) : null}

          {screen === 'lobby' ? <LobbyPanel onLeave={leaveLobby} /> : null}

          {screen === 'results' ? (
            <ResultsPanel onPlayAgain={playAgain} onMenu={backToMenu} />
          ) : null}
        </>
      )}

      {/* The exit. Hidden while a round is running: it lives in the same
          top-left corner as the score readout, and on a phone in landscape the
          stage reaches the screen edge, so the two sat on top of each other. */}
      {running ? null : (
        <div
          className="absolute z-[60]"
          style={{
            left: 'calc(env(safe-area-inset-left, 0px) + 0.75rem)',
            top: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)',
          }}
        >
          <Button asChild variant="ghost" size="sm" className="border border-white/10 bg-black/50">
            <Link to="/builds">
              <ArrowLeft className="size-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">RMH Studios</span>
              <span className="sr-only sm:hidden">
                {t('back-to-studios', { defaultValue: 'Back to RMH Studios' })}
              </span>
            </Link>
          </Button>
        </div>
      )}

      <RotateHint active={running} />

      {mode === 'versus' && connection !== 'idle' && connection !== 'connected' ? (
        <div className="pointer-events-auto absolute inset-x-0 top-0 z-50">
          <ConnectionBanner status={connection} onRetry={reconnectNow} />
        </div>
      ) : null}
    </div>
  );
}
