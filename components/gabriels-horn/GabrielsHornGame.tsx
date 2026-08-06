'use client';

/**
 * Gabriel's Horn — game root.
 *
 * Connection, screen routing, and the party-ticket handoff. Everything else is
 * a screen: this component owns no game state at all, because the game state is
 * the server's and arrives already filtered for this seat.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouterState } from '@tanstack/react-router';
import { toast } from 'sonner';
import AppShell from '@/components/shared/AppShell';
import { useSession } from '@/components/Providers';
import { useLobbyInvite, useLobbyInviteJoin } from '@/hooks/useLobbyLink';
import { useHornStore } from '@/lib/gabriels-horn/store';
import {
  connectHorn,
  disconnectHorn,
  hornNet,
  reconnectNow,
  storedTableCode,
} from '@/lib/gabriels-horn/net/client';
import type { PartyTicketMsg } from '@/lib/party/types';
import { BrowsePanel, LobbyPanel, useLobbyErrorMessage } from './LobbyPanel';
import { MainMenu } from './MainMenu';
import { ResultsPanel } from './ResultsPanel';
import { RulesSheet } from './RulesSheet';
import { TableScreen } from './TableScreen';
import './gabriels-horn.css';

export function GabrielsHornGame() {
  const { t } = useTranslation('c-gabriels-horn');
  const { data: session } = useSession();
  const signedIn = Boolean(session?.user?.id);
  const errorMessage = useLobbyErrorMessage();

  const [connecting, setConnecting] = useState(false);
  /**
   * A table is being rejoined after a reload. Held separately from `connecting`
   * because it needs its own screen: without one the player watches the MENU
   * for the second or two the session fetch and the socket handshake take,
   * which reads as "my game is gone" at the exact moment it is not.
   */
  const [resuming, setResuming] = useState(false);

  const screen = useHornStore((s) => s.screen);
  const view = useHornStore((s) => s.view);
  const results = useHornStore((s) => s.results);
  const selfSocketId = useHornStore((s) => s.selfSocketId);
  const connection = useHornStore((s) => s.connection);
  const rulesOpen = useHornStore((s) => s.rulesOpen);
  const error = useHornStore((s) => s.error);

  // ── Connection ────────────────────────────────────────────────────────────

  const ensureConnected = useCallback(async (): Promise<boolean> => {
    setConnecting(true);
    try {
      await connectHorn();
      return true;
    } catch {
      toast.error(t('error-connect', { defaultValue: 'Could not reach the game server.' }));
      return false;
    } finally {
      setConnecting(false);
    }
  }, [t]);

  useEffect(() => () => disconnectHorn(), []);

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
      if (ok && !cancelled) hornNet.ticket(partyTicket.token);
    })();
    return () => {
      cancelled = true;
    };
  }, [partyTicket, signedIn, ensureConnected]);

  // An invite link. Same join the code field makes, minus the eight characters
  // somebody would otherwise have to read out and somebody else mistype.
  const invite = useLobbyInvite();

  useLobbyInviteJoin(signedIn, (code) => {
    void (async () => {
      if (await ensureConnected()) hornNet.join(code.toUpperCase());
    })();
  });

  // Walk straight back into a table this tab was already at.
  //
  // A socket drop recovers on its own — the module is still loaded and the
  // client re-joins. A RELOAD does not, and a phone reloading a backgrounded tab
  // mid-turn is ordinary. The server holds the seat and the hand for a grace
  // window either way; this is the half that tells it which table we mean. A
  // refused rejoin (grace expired, table gone) lands on the menu via the error
  // handler, so a stale code costs nothing.
  //
  // An invite link outranks it: being handed a table is a deliberate choice to
  // sit at THAT one, not at whichever one this tab was last at.
  useEffect(() => {
    if (!signedIn || partyTicket?.token || invite) return;
    const code = storedTableCode();
    if (!code) return;
    let cancelled = false;
    setResuming(true);
    void (async () => {
      const ok = await ensureConnected();
      if (ok && !cancelled) hornNet.join(code);
      if (!ok && !cancelled) setResuming(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn, partyTicket, invite, ensureConnected]);

  // The rejoin landed (any screen but the menu) or was refused (the error
  // handler already sent us to the menu and cleared the stored code).
  useEffect(() => {
    if (screen !== 'menu') setResuming(false);
  }, [screen]);

  useEffect(() => {
    if (error) setResuming(false);
  }, [error]);

  // ── Errors ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!error) return;
    // The lobby renders its error inline; everywhere else needs a toast, or a
    // refused action looks like a dead button.
    if (screen !== 'lobby') toast.error(errorMessage(error));
    const timer = window.setTimeout(() => useHornStore.getState().setError(null), 5000);
    return () => window.clearTimeout(timer);
  }, [error, screen, errorMessage]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const withConnection = useCallback(
    (action: () => void) => async () => {
      if (await ensureConnected()) action();
    },
    [ensureConnected],
  );

  const leave = useCallback(() => {
    hornNet.leave();
    useHornStore.getState().leaveTable();
  }, []);

  const rematch = useCallback(() => {
    const store = useHornStore.getState();
    hornNet.rematch();
    store.setResults(null);
    store.setView(null);
    store.setScreen('lobby');
  }, []);

  const setRulesOpen = useHornStore((s) => s.setRulesOpen);

  return (
    <AppShell
      appClassName="gabriels-horn-theme"
      realtime={{ status: connection, onRetry: reconnectNow }}
    >
      {screen === 'menu' && resuming ? (
        <div className="app-screen bg-(--app-bg) text-(--app-text)">
          <p className="text-center text-sm text-(--app-text-muted)" role="status">
            {t('resuming', { defaultValue: 'Returning you to your table…' })}
          </p>
        </div>
      ) : null}

      {screen === 'menu' && !resuming ? (
        <MainMenu
          signedIn={signedIn}
          connecting={connecting}
          onRules={() => setRulesOpen(true)}
          onQuickTable={withConnection(() => hornNet.quickplay())}
          onHost={withConnection(() => hornNet.create({ isPublic: true }))}
          onJoinCode={(code) => void withConnection(() => hornNet.join(code))()}
          onBrowse={withConnection(() => {
            const store = useHornStore.getState();
            store.setBrowsing(true);
            store.setScreen('browse');
            hornNet.browse();
          })}
        />
      ) : null}

      {screen === 'browse' ? (
        <BrowsePanel
          onBack={() => useHornStore.getState().setScreen('menu')}
          onRefresh={() => {
            useHornStore.getState().setBrowsing(true);
            hornNet.browse();
          }}
        />
      ) : null}

      {screen === 'lobby' ? (
        <LobbyPanel onLeave={leave} onRules={() => setRulesOpen(true)} />
      ) : null}

      {screen === 'table' && view ? (
        <TableScreen view={view} onLeave={leave} onRules={() => setRulesOpen(true)} />
      ) : null}

      {screen === 'results' && results ? (
        <ResultsPanel
          results={results}
          selfSocketId={selfSocketId}
          onRematch={rematch}
          onLeave={leave}
        />
      ) : null}

      {rulesOpen ? <RulesSheet onClose={() => setRulesOpen(false)} /> : null}
    </AppShell>
  );
}
