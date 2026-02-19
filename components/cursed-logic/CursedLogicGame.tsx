'use client';

import { useEffect, useRef } from 'react';
import { useCursedLogicStore } from '@/lib/cursed-logic/gameState';
import { getProtocolAction } from '@/lib/cursed-logic/protocol';
import { resolveRound, chargeAfterSpend } from '@/lib/cursed-logic/resolution';
import { rollMutation, getModifierLabel } from '@/lib/cursed-logic/mutations';
import type { RoundState } from '@/lib/cursed-logic/types';

function buildRoundState(s: ReturnType<typeof useCursedLogicStore.getState>): RoundState {
  return {
    round: s.round,
    lastPlayerAction: s.lastRound?.playerAction ?? null,
    lastProtocolAction: s.lastRound?.protocolAction ?? null,
    playerPrepared: s.playerPrepared,
    protocolPrepared: s.protocolPrepared,
    protocolHealth: s.protocolHealth,
    currentModifier: s.currentModifier,
  };
}

const ACTION_LABELS: Record<string, string> = {
  Strike: 'Strike',
  Block: 'Block',
  Prepare: 'Prepare',
  Probe: 'Probe',
  Idle: 'Idle',
};

export function CursedLogicGame() {
  const {
    phase,
    round,
    charge,
    integrity,
    protocolHealth,
    chargeCap,
    currentModifier,
    lastRound,
    log,
    pendingPlayerAction,
    pendingProtocolAction,
    probeRevealedIntent,
    result,
    commit,
    setReveal,
    applyResolution,
    advanceToCommit,
    resetGame,
  } = useCursedLogicStore();

  const revealTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolvedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCommit = (action: 'Strike' | 'Block' | 'Prepare' | 'Probe') => {
    const state = useCursedLogicStore.getState();
    if (state.phase !== 'commit' || state.result) return;
    state.commit(action);
    const s = useCursedLogicStore.getState();
    const roundState = buildRoundState(s);
    const protocolAction = getProtocolAction(roundState);
    useCursedLogicStore.getState().setReveal(
      protocolAction,
      action === 'Probe' ? protocolAction : null
    );
  };

  useEffect(() => {
    if (phase !== 'reveal') return;
    revealTimeoutRef.current = setTimeout(() => {
      const s = useCursedLogicStore.getState();
      if (s.phase !== 'reveal') return;
      const playerAction = s.pendingPlayerAction!;
      const protocolAction = s.pendingProtocolAction!;
      const lastRoundResult = resolveRound(
        playerAction,
        protocolAction,
        s.playerPrepared,
        s.protocolPrepared,
        s.currentModifier,
        s.charge === 0
      );
      const nextCharge = chargeAfterSpend(s.charge, s.chargeCap);
      const nextModifier = rollMutation();
      useCursedLogicStore.getState().applyResolution(lastRoundResult, nextCharge, nextModifier);
    }, 1500);
    return () => {
      if (revealTimeoutRef.current) clearTimeout(revealTimeoutRef.current);
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== 'resolved' || result) return;
    resolvedTimeoutRef.current = setTimeout(() => {
      useCursedLogicStore.getState().advanceToCommit();
    }, 1200);
    return () => {
      if (resolvedTimeoutRef.current) clearTimeout(resolvedTimeoutRef.current);
    };
  }, [phase, result]);

  if (result) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 p-6 text-center">
        <h2 className="text-3xl font-black tracking-tighter text-white">
          {result === 'win' ? 'PROTOCOL OVERLOAD' : 'INTEGRITY ZERO'}
        </h2>
        <p className="text-white/70">
          {result === 'win' ? 'The system breaks. You survive.' : 'The Protocol consumes you.'}
        </p>
        <button
          type="button"
          onClick={() => resetGame()}
          className="rounded-lg bg-cyan-500/20 px-6 py-3 font-bold text-cyan-300 border border-cyan-500/50 hover:bg-cyan-500/30 transition-colors"
        >
          Play Again
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full max-w-lg mx-auto p-4 gap-6">
      <div className="grid grid-cols-2 gap-2 text-center font-mono text-sm">
        <div className="rounded bg-white/5 border border-white/10 p-2">
          <div className="text-cyan-400">Charge</div>
          <div className="text-white font-bold">{charge} / {chargeCap}</div>
        </div>
        <div className="rounded bg-white/5 border border-white/10 p-2">
          <div className="text-cyan-400">Integrity</div>
          <div className="text-white font-bold">{integrity}</div>
        </div>
        <div className="rounded bg-white/5 border border-amber-500/20 p-2">
          <div className="text-amber-400/90">Protocol</div>
          <div className="text-white font-bold">{protocolHealth}</div>
        </div>
        <div className="rounded bg-white/5 border border-white/10 p-2">
          <div className="text-white/60">Round</div>
          <div className="text-white font-bold">{round}</div>
        </div>
      </div>

      {currentModifier && (
        <div className="text-center text-amber-400/80 text-xs font-mono border border-amber-500/30 rounded px-3 py-1">
          {getModifierLabel(currentModifier)}
        </div>
      )}

      {phase === 'commit' && (
        <div className="flex flex-col gap-3">
          <p className="text-white/60 text-sm text-center">Choose an action</p>
          <div className="grid grid-cols-2 gap-2">
            {(['Strike', 'Block', 'Prepare', 'Probe'] as const).map((action) => (
              <button
                key={action}
                type="button"
                onClick={() => handleCommit(action)}
                className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 py-3 font-mono font-bold text-cyan-200 hover:bg-cyan-500/20 transition-colors"
              >
                {ACTION_LABELS[action]}
              </button>
            ))}
          </div>
          {charge === 0 && (
            <p className="text-amber-400/80 text-xs text-center">Overdraw: no Charge. Action still costs 1; you take penalty if you act.</p>
          )}
        </div>
      )}

      {phase === 'reveal' && (
        <div className="flex flex-col gap-4 text-center">
          <p className="text-white/60 text-sm">Reveal</p>
          <div className="flex justify-center gap-6">
            <div>
              <div className="text-cyan-400 text-xs">You</div>
              <div className="font-mono font-bold text-white">{pendingPlayerAction && ACTION_LABELS[pendingPlayerAction]}</div>
            </div>
            <div>
              <div className="text-amber-400/90 text-xs">Protocol</div>
              <div className="font-mono font-bold text-white">{pendingProtocolAction && ACTION_LABELS[pendingProtocolAction]}</div>
            </div>
          </div>
          {probeRevealedIntent && <p className="text-white/50 text-xs">(Probe revealed intent)</p>}
          <p className="text-white/40 text-sm animate-pulse">Resolving...</p>
        </div>
      )}

      {phase === 'resolved' && lastRound && (
        <div className="flex flex-col gap-2 text-center">
          <p className="text-white/60 text-sm">Result</p>
          <p className="font-mono text-sm text-white">
            You: {ACTION_LABELS[lastRound.playerAction]} — Protocol: {ACTION_LABELS[lastRound.protocolAction]}
          </p>
          <p className="text-white/80">
            {lastRound.protocolDamage > 0 && <span className="text-cyan-400">Protocol -{lastRound.protocolDamage}</span>}
            {lastRound.protocolDamage > 0 && lastRound.playerDamage > 0 && ' · '}
            {lastRound.playerDamage > 0 && <span className="text-amber-400">You -{lastRound.playerDamage}</span>}
            {lastRound.playerDamage === 0 && lastRound.protocolDamage === 0 && 'No damage'}
          </p>
          {lastRound.overdraw && <p className="text-amber-400/80 text-xs">Overdraw penalty applied</p>}
          <p className="text-white/40 text-sm">Next round...</p>
        </div>
      )}

      {log.length > 0 && (
        <div className="mt-auto border-t border-white/10 pt-3">
          <p className="text-white/40 text-xs font-mono mb-1">Last rounds</p>
          <ul className="text-xs font-mono text-white/60 space-y-0.5">
            {log.slice(0, 3).map((r, i) => (
              <li key={i}>
                {r.playerAction} vs {r.protocolAction} — You {r.playerDamage > 0 ? `-${r.playerDamage}` : '0'} / Protocol {r.protocolDamage > 0 ? `-${r.protocolDamage}` : '0'}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
