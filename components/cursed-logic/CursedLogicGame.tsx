'use client';

import { useEffect, useRef, useState } from 'react';
import { useCursedLogicStore } from '@/lib/cursed-logic/gameState';
import { getProtocolAction } from '@/lib/cursed-logic/protocol';
import { resolveRound, chargeAfterSpend } from '@/lib/cursed-logic/resolution';
import { getMinigameForRound } from '@/lib/cursed-logic/minigame';
import { rollMutation, getModifierLabel } from '@/lib/cursed-logic/mutations';
import * as sounds from '@/lib/cursed-logic/sounds';
import { useShopStore } from '@/lib/cursed-logic/shopState';
import type { RoundState, ProtocolAction } from '@/lib/cursed-logic/types';
import {
  PROTOCOL_VARIANT_NAMES,
  RUN_UPGRADE_LABELS,
  getStanceLabel,
  getStanceHint,
  getStanceEffect,
  PROTOCOL_MODE_LABELS,
} from '@/lib/cursed-logic/types';
import { MinigameOverlay } from './MinigameOverlay';

function buildRoundState(s: ReturnType<typeof useCursedLogicStore.getState>): RoundState {
  return {
    round: s.round,
    lastPlayerAction: s.lastRound?.playerAction ?? null,
    lastProtocolAction: s.lastRound?.protocolAction ?? null,
    playerPrepared: s.playerPrepared,
    protocolPrepared: s.protocolPrepared,
    protocolHealth: s.protocolHealth,
    currentModifier: s.currentModifier,
    protocolVariant: s.protocolVariant,
    chaosRun: s.runModifier === 'chaosRun',
    doubleDown: s.runModifier === 'doubleDown',
    protocolMode: s.protocolMode,
  };
}

/** Build round state for "next round" after this one (for Probe next-round reveal). */
function buildNextRoundState(
  s: ReturnType<typeof useCursedLogicStore.getState>,
  thisRoundProtocolAction: ProtocolAction
): RoundState {
  const nextMode =
    thisRoundProtocolAction === 'Strike'
      ? 'pressuring'
      : thisRoundProtocolAction === 'Block'
        ? 'defensive'
        : 'recovering';
  return {
    round: s.round + 1,
    lastPlayerAction: 'Probe',
    lastProtocolAction: thisRoundProtocolAction,
    playerPrepared: false,
    protocolPrepared: thisRoundProtocolAction === 'Prepare',
    protocolHealth: s.protocolHealth,
    currentModifier: null,
    protocolVariant: s.protocolVariant,
    chaosRun: s.runModifier === 'chaosRun',
    doubleDown: s.runModifier === 'doubleDown',
    protocolMode: nextMode,
  };
}

/** Build round state for the round after next (for Scan stance Probe). */
function buildRoundStateAfterNext(
  s: ReturnType<typeof useCursedLogicStore.getState>,
  thisRoundProtocolAction: ProtocolAction,
  nextRoundProtocolAction: ProtocolAction
): RoundState {
  const mode =
    nextRoundProtocolAction === 'Strike'
      ? 'pressuring'
      : nextRoundProtocolAction === 'Block'
        ? 'defensive'
        : 'recovering';
  return {
    round: s.round + 2,
    lastPlayerAction: 'Probe',
    lastProtocolAction: nextRoundProtocolAction,
    playerPrepared: false,
    protocolPrepared: nextRoundProtocolAction === 'Prepare',
    protocolHealth: s.protocolHealth,
    currentModifier: null,
    protocolVariant: s.protocolVariant,
    chaosRun: s.runModifier === 'chaosRun',
    doubleDown: s.runModifier === 'doubleDown',
    protocolMode: mode,
  };
}

const ACTION_LABELS: Record<string, string> = {
  Strike: 'Strike',
  Block: 'Block',
  Prepare: 'Prepare',
  Probe: 'Probe',
  Idle: 'Idle',
};

const MAX_INTEGRITY_DISPLAY = 10;
const PROTOCOL_MAX_DISPLAY = 10;

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
    revealedProtocolIntent,
    playerPrepared,
    protocolPrepared,
    result,
    commit,
    setReveal,
    setRevealStep,
    setRevealedProtocolIntent,
    setProbeRevealedNextIntent,
    applyResolution,
    setMinigamePending,
    completeMinigame,
    advanceToCommit,
    pickMilestone,
    resetGame,
    protocolVariant,
    runUpgrades,
    runModifier,
    milestoneChoices,
    probeRevealedNextIntent,
    probeRevealedRoundAfterNext,
    chooseStance,
    currentStance,
    stanceChoices,
    reinforced,
    revealStep,
    protocolMode,
    playerCondition,
    protocolCondition,
    minigameKind,
    minigameChaosDistort,
  } = useCursedLogicStore();

  const [animationKey, setAnimationKey] = useState(0);
  const [reinforce, setReinforce] = useState(false);
  const revealTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolvedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSoundRoundRef = useRef<number>(0);
  const lastResultRef = useRef<'win' | 'lose' | null>(null);
  const awardedRef = useRef(false);

  useEffect(() => {
    if (phase === 'stance') setReinforce(false);
  }, [phase]);

  // Sound: lasers when reveal phase starts (both strikes)
  useEffect(() => {
    if (phase !== 'reveal') return;
    if (pendingPlayerAction === 'Strike') {
      setTimeout(() => sounds.laserFire(true), 80);
    }
    if (pendingProtocolAction === 'Strike') {
      setTimeout(() => sounds.laserFire(false), 120);
    }
  }, [phase, pendingPlayerAction, pendingProtocolAction]);

  // Sound: shield and damage when resolved
  useEffect(() => {
    if (phase !== 'resolved' || !lastRound || lastSoundRoundRef.current === round) return;
    lastSoundRoundRef.current = round;
    const { playerAction, protocolAction, playerDamage, protocolDamage } = lastRound;
    if (playerAction === 'Block') setTimeout(() => sounds.shieldBlock(true), 50);
    if (protocolAction === 'Block') setTimeout(() => sounds.shieldBlock(false), 100);
    if (playerDamage > 0) setTimeout(() => sounds.damageHit(), 150);
    if (protocolDamage > 0) setTimeout(() => sounds.damageHit(), 200);
  }, [phase, lastRound, round]);

  // Sound: win/lose once when result is set
  useEffect(() => {
    if (!result || lastResultRef.current === result) return;
    lastResultRef.current = result;
    if (result === 'win') sounds.gameWin();
    else sounds.gameLose();
  }, [result]);

  // Reset sound refs when starting a new run (after Play Again)
  useEffect(() => {
    if (result === null) {
      lastResultRef.current = null;
      awardedRef.current = false;
    }
    if (phase === 'commit' && round === 1) lastSoundRoundRef.current = 0;
  }, [result, phase, round]);

  // Award fragments when run ends (once per run)
  useEffect(() => {
    if (!result || awardedRef.current) return;
    awardedRef.current = true;
    useShopStore.getState().awardRun(round, result === 'win');
  }, [result, round]);

  // Reveal modifier: pre-roll Protocol intent at start of round so player can see it before committing
  useEffect(() => {
    if (phase !== 'commit' || currentModifier !== 'Reveal' || revealedProtocolIntent !== null) return;
    const s = useCursedLogicStore.getState();
    const roundState = buildRoundState(s);
    const protocolAction = getProtocolAction(roundState);
    useCursedLogicStore.getState().setRevealedProtocolIntent(protocolAction);
  }, [phase, currentModifier, revealedProtocolIntent]);

  const handleCommit = (action: 'Strike' | 'Block' | 'Prepare' | 'Probe') => {
    const state = useCursedLogicStore.getState();
    if (state.phase !== 'commit' || state.result) return;
    const useReinforce = reinforce && state.charge >= 2;
    state.commit(action, useReinforce);
    const s = useCursedLogicStore.getState();
    const protocolAction =
      s.currentModifier === 'Reveal' && s.revealedProtocolIntent !== null
        ? s.revealedProtocolIntent
        : getProtocolAction(buildRoundState(s));
    const store = useCursedLogicStore.getState();
    store.setReveal(protocolAction, null);
    if (action === 'Probe') {
      const nextIntent = getProtocolAction(buildNextRoundState(s, protocolAction));
      store.setProbeRevealedNextIntent(nextIntent);
      if (getStanceEffect(s.currentStance) === 'probe_two_rounds') {
        const roundAfterNextIntent = getProtocolAction(buildRoundStateAfterNext(s, protocolAction, nextIntent));
        store.setProbeRevealedRoundAfterNext(roundAfterNextIntent);
      } else {
        store.setProbeRevealedRoundAfterNext(null);
      }
    } else {
      store.setProbeRevealedRoundAfterNext(null);
    }
  };

  useEffect(() => {
    if (phase !== 'reveal') return;
    const delay = revealStep === 0 ? 800 : revealStep === 1 ? 800 : 600;
    revealTimeoutRef.current = setTimeout(() => {
      const s = useCursedLogicStore.getState();
      if (s.phase !== 'reveal') return;
      if (s.revealStep < 2) {
        useCursedLogicStore.getState().setRevealStep(s.revealStep + 1);
        return;
      }
      const playerAction = s.pendingPlayerAction!;
      const protocolAction = s.pendingProtocolAction!;
      const spent = s.reinforced ? 2 : 1;
      const lastRoundResult = resolveRound(
        playerAction,
        protocolAction,
        s.playerPrepared,
        s.protocolPrepared,
        s.currentModifier,
        s.charge === 0,
        s.runUpgrades,
        s.runModifier === 'doubleDown',
        s.currentStance,
        s.reinforced,
        s.playerCondition,
        s.protocolCondition
      );
      let nextCharge = chargeAfterSpend(s.charge, s.chargeCap, spent);
      if (s.runUpgrades.includes('chargeOnKill') && lastRoundResult.protocolDamage > 0) {
        nextCharge = Math.min(s.chargeCap, nextCharge + 1);
      }
      const nextModifier = rollMutation(s.runModifier === 'chaosRun');
      const minigame = getMinigameForRound(
        playerAction,
        protocolAction,
        s.currentModifier,
        lastRoundResult.playerDamage,
        lastRoundResult.protocolDamage
      );
      if (minigame) {
        useCursedLogicStore.getState().setMinigamePending(
          lastRoundResult,
          nextCharge,
          nextModifier,
          minigame.kind,
          minigame.chaosDistort
        );
      } else {
        useCursedLogicStore.getState().applyResolution(lastRoundResult, nextCharge, nextModifier);
      }
      setAnimationKey((k) => k + 1);
    }, delay);
    return () => {
      if (revealTimeoutRef.current) clearTimeout(revealTimeoutRef.current);
    };
  }, [phase, revealStep]);

  useEffect(() => {
    if (phase !== 'resolved' || result || milestoneChoices) return;
    resolvedTimeoutRef.current = setTimeout(() => {
      useCursedLogicStore.getState().advanceToCommit();
    }, 1200);
    return () => {
      if (resolvedTimeoutRef.current) clearTimeout(resolvedTimeoutRef.current);
    };
  }, [phase, result, milestoneChoices]);

  const playerHit = lastRound && lastRound.playerDamage > 0;
  const protocolHit = lastRound && lastRound.protocolDamage > 0;
  const playerBlocked = lastRound?.playerAction === 'Block';
  const protocolBlocked = lastRound?.protocolAction === 'Block';

  if (result) {
    const runModifiers = useShopStore.getState().getRunModifiers();
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
          onClick={() => {
            resetGame(runModifiers);
            useShopStore.getState().consumeRunModifier();
          }}
          className="rounded-lg bg-cyan-500/20 px-6 py-3 font-bold text-cyan-300 border border-cyan-500/50 hover:bg-cyan-500/30 transition-colors"
        >
          Play Again
        </button>
      </div>
    );
  }

  if (phase === 'milestone' && milestoneChoices) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 p-6 text-center">
        <h2 className="text-lg font-bold text-cyan-400 font-mono">Choose an upgrade</h2>
        <p className="text-white/60 text-sm">Round {round} — pick one for the rest of the run</p>
        <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
          {milestoneChoices.map((choice) => (
            <button
              key={choice}
              type="button"
              onClick={() => pickMilestone(choice)}
              className="rounded-lg border border-cyan-500/50 bg-cyan-500/10 py-3 px-4 font-mono text-sm text-cyan-200 hover:bg-cyan-500/20 transition-colors"
            >
              {RUN_UPGRADE_LABELS[choice]}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      {phase === 'minigame' && minigameKind && (
        <MinigameOverlay
          kind={minigameKind}
          chaosDistort={minigameChaosDistort}
          onComplete={(success) => {
            completeMinigame(success);
            setAnimationKey((k) => k + 1);
          }}
        />
      )}
    <div className="flex flex-col h-full max-w-lg mx-auto p-4 gap-4">
      {/* Top stats row — large and clear */}
      <div className="grid grid-cols-4 gap-3 text-center font-mono shrink-0">
        <div className="rounded-xl bg-cyan-500/10 border-2 border-cyan-500/40 p-3">
          <div className="text-cyan-400 text-sm font-bold">Charge</div>
          <div className={`text-xl font-black tabular-nums ${charge <= 1 ? 'text-amber-400' : 'text-white'}`}>
            {charge} / {chargeCap}
          </div>
        </div>
        <div className="rounded-xl bg-white/10 border-2 border-white/20 p-3">
          <div className="text-cyan-400 text-sm font-bold">Integrity</div>
          <div className="text-xl font-black text-white tabular-nums">{integrity}</div>
        </div>
        <div className="rounded-xl bg-amber-500/10 border-2 border-amber-500/40 p-3">
          <div className="text-amber-400 text-sm font-bold">{PROTOCOL_VARIANT_NAMES[protocolVariant]}</div>
          <div className="text-xl font-black text-white tabular-nums">{protocolHealth}</div>
        </div>
        <div className="rounded-xl bg-white/10 border-2 border-white/20 p-3">
          <div className="text-white/70 text-sm font-bold">Round</div>
          <div className="text-xl font-black text-white tabular-nums">{round}</div>
        </div>
      </div>

      {(playerCondition || protocolCondition) && phase !== 'stance' && (
        <div className="flex flex-wrap justify-center gap-2 shrink-0">
          {playerCondition && (
            <span className="rounded bg-amber-500/20 border border-amber-500/50 px-2 py-0.5 text-amber-300 text-xs font-mono">
              You: {playerCondition}
            </span>
          )}
          {protocolCondition && (
            <span className="rounded bg-cyan-500/20 border border-cyan-500/50 px-2 py-0.5 text-cyan-300 text-xs font-mono">
              Protocol: {protocolCondition}
            </span>
          )}
        </div>
      )}

      {charge <= 1 && phase === 'commit' && (
        <p className="text-amber-400/90 text-xs text-center font-mono shrink-0">
          {charge === 0 ? 'Overdraw: next action costs 1 and you take a penalty.' : 'Low charge—overdraw risk next round.'}
        </p>
      )}

      {/* Duel arena: Player (left) vs Protocol (right) */}
      <div className="relative flex items-center justify-between gap-4 py-6 px-2 min-h-[160px] shrink-0">
        {/* Laser beams (reveal phase): Protocol at step 0, Player at step 1+ */}
        {phase === 'reveal' && revealStep >= 1 && pendingPlayerAction === 'Strike' && (
          <div
            key={`laser-p-${animationKey}`}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            aria-hidden
          >
            <div
              className="h-2 w-full max-w-[55%] rounded-full origin-left"
              style={{
                background: 'linear-gradient(90deg, rgba(34,211,238,0.9) 0%, rgba(34,211,238,0.4) 60%, transparent 100%)',
                boxShadow: '0 0 20px 4px rgba(34,211,238,0.6)',
                animation: 'cursed-laser-travel 0.4s ease-out forwards',
              }}
            />
            <div
              className="absolute right-[22%] w-8 h-8 rounded-full bg-cyan-400/80 pointer-events-none"
              style={{
                boxShadow: '0 0 25px 10px rgba(34,211,238,0.7)',
                animation: 'cursed-laser-impact 0.35s ease-out 0.25s forwards',
              }}
            />
          </div>
        )}
        {phase === 'reveal' && revealStep >= 0 && pendingProtocolAction === 'Strike' && (
          <div
            key={`laser-sys-${animationKey}`}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            aria-hidden
          >
            <div
              className="h-2 w-full max-w-[55%] ml-auto rounded-full"
              style={{
                background: 'linear-gradient(270deg, rgba(251,191,36,0.9) 0%, rgba(251,191,36,0.4) 60%, transparent 100%)',
                boxShadow: '0 0 20px 4px rgba(251,191,36,0.5)',
                animation: 'cursed-laser-travel 0.4s ease-out forwards',
                transformOrigin: 'right',
              }}
            />
            <div
              className="absolute left-[22%] w-8 h-8 rounded-full bg-amber-400/80 pointer-events-none"
              style={{
                boxShadow: '0 0 25px 10px rgba(251,191,36,0.6)',
                animation: 'cursed-laser-impact 0.35s ease-out 0.25s forwards',
              }}
            />
          </div>
        )}

        {/* Player avatar */}
        <div className="flex flex-col items-center gap-1 w-24 relative">
          {/* Reveal-phase action animations */}
          {phase === 'reveal' && revealStep >= 1 && pendingPlayerAction === 'Block' && (
            <div key={`rev-block-p-${animationKey}`} className="absolute inset-0 flex items-center justify-center pointer-events-none z-10" aria-hidden>
              <div className="w-20 h-20 rounded-full border-4 border-cyan-400/90 bg-cyan-400/20" style={{ animation: 'cursed-block-reveal 0.4s ease-out forwards', boxShadow: '0 0 20px 6px rgba(34,211,238,0.4)' }} />
            </div>
          )}
          {phase === 'reveal' && revealStep >= 1 && pendingPlayerAction === 'Prepare' && (
            <div key={`rev-prep-p-${animationKey}`} className="absolute inset-0 flex items-center justify-center pointer-events-none z-10" aria-hidden>
              <div className="w-24 h-24 rounded-full border-2 border-cyan-400/70 bg-cyan-400/10" style={{ animation: 'cursed-prepare-reveal 0.6s ease-out forwards' }} />
            </div>
          )}
          {phase === 'reveal' && revealStep >= 1 && pendingPlayerAction === 'Probe' && (
            <div key={`rev-probe-p-${animationKey}`} className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 overflow-hidden rounded-full" aria-hidden>
              <div className="w-full h-1 bg-cyan-400/90 rounded-full" style={{ animation: 'cursed-probe-scan 0.5s ease-in-out forwards' }} />
            </div>
          )}
          {playerBlocked && phase === 'resolved' && (
            <div
              key={`shield-p-${animationKey}`}
              className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
              aria-hidden
            >
              <div
                className="w-20 h-20 rounded-full border-4 border-cyan-400/90 bg-cyan-400/20"
                style={{
                  animation: 'cursed-shield-in 0.25s ease-out forwards, cursed-shield-ripple 0.5s ease-out 0.2s',
                  boxShadow: '0 0 20px 6px rgba(34,211,238,0.4)',
                }}
              />
            </div>
          )}
          {playerHit && phase === 'resolved' && (
            <div
              key={`impact-p-${animationKey}`}
              className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
              aria-hidden
            >
              <div
                className="w-16 h-16 rounded-full bg-red-500/70"
                style={{ animation: 'cursed-impact-burst 0.4s ease-out forwards' }}
              />
            </div>
          )}
          <div
            key={`player-${animationKey}`}
            className={`w-16 h-16 rounded-full border-2 flex items-center justify-center font-mono text-xs transition-all duration-300 relative z-0
              ${playerHit ? 'animate-[cursed-damage_0.5s_ease-out] border-red-500/80 bg-red-500/20' : ''}
              ${playerBlocked && phase === 'resolved' ? 'border-cyan-400 bg-cyan-500/20' : ''}
              ${playerPrepared && phase === 'commit' ? 'animate-[cursed-prepare_1.5s_ease-in-out_infinite] border-cyan-400 bg-cyan-500/10' : ''}
              ${!playerHit && !playerBlocked && !playerPrepared ? 'border-cyan-500/60 bg-cyan-500/10' : ''}
            `}
          >
            <span className="text-cyan-300 font-bold">YOU</span>
          </div>
          <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-cyan-500/80 rounded-full transition-all duration-500"
              style={{ width: `${(integrity / MAX_INTEGRITY_DISPLAY) * 100}%` }}
            />
          </div>
          {playerPrepared && phase === 'commit' && (
            <span className="text-cyan-400 text-[10px] font-mono">NEXT +1</span>
          )}
        </div>

        <div className="text-white/30 font-mono text-xs shrink-0">VS</div>

        {/* Protocol avatar */}
        <div className="flex flex-col items-center gap-1 w-24 relative">
          {phase === 'reveal' && revealStep >= 0 && pendingProtocolAction === 'Block' && (
            <div key={`rev-block-sys-${animationKey}`} className="absolute inset-0 flex items-center justify-center pointer-events-none z-10" aria-hidden>
              <div className="w-20 h-20 rounded-full border-4 border-amber-400/90 bg-amber-400/20" style={{ clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)', animation: 'cursed-block-reveal 0.4s ease-out forwards', boxShadow: '0 0 20px 6px rgba(251,191,36,0.4)' }} />
            </div>
          )}
          {phase === 'reveal' && revealStep >= 0 && pendingProtocolAction === 'Prepare' && (
            <div key={`rev-prep-sys-${animationKey}`} className="absolute inset-0 flex items-center justify-center pointer-events-none z-10" aria-hidden>
              <div className="w-24 h-24 rounded-full border-2 border-amber-400/70 bg-amber-400/10" style={{ clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)', animation: 'cursed-prepare-reveal 0.6s ease-out forwards' }} />
            </div>
          )}
          {phase === 'reveal' && revealStep >= 0 && pendingProtocolAction === 'Idle' && (
            <div key={`rev-idle-sys-${animationKey}`} className="absolute inset-0 flex items-center justify-center pointer-events-none z-10" aria-hidden>
              <div className="w-16 h-16 rounded-full bg-amber-500/20" style={{ animation: 'cursed-idle-pulse 0.8s ease-in-out infinite' }} />
            </div>
          )}
          {protocolBlocked && phase === 'resolved' && (
            <div
              key={`shield-sys-${animationKey}`}
              className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
              aria-hidden
            >
              <div
                className="w-20 h-20 rounded-full border-4 border-amber-400/90 bg-amber-400/20"
                style={{
                  clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
                  animation: 'cursed-shield-in 0.25s ease-out forwards, cursed-shield-ripple 0.5s ease-out 0.2s',
                  boxShadow: '0 0 20px 6px rgba(251,191,36,0.4)',
                }}
              />
            </div>
          )}
          {protocolHit && phase === 'resolved' && (
            <div
              key={`impact-sys-${animationKey}`}
              className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
              aria-hidden
            >
              <div
                className="w-16 h-16 rounded-full bg-red-500/70"
                style={{ animation: 'cursed-impact-burst 0.4s ease-out forwards' }}
              />
            </div>
          )}
          <div
            key={`protocol-${animationKey}`}
            className={`w-16 h-16 border-2 flex items-center justify-center font-mono text-[10px] transition-all duration-300 relative z-0
              ${protocolHit ? 'animate-[cursed-damage_0.5s_ease-out] border-red-500/80 bg-red-500/20' : ''}
              ${protocolBlocked && phase === 'resolved' ? 'border-amber-400 bg-amber-500/20' : ''}
              ${protocolPrepared && phase === 'commit' ? 'animate-[cursed-prepare_1.5s_ease-in-out_infinite] border-amber-400 bg-amber-500/10' : ''}
              ${!protocolHit && !protocolBlocked && !protocolPrepared ? 'border-amber-500/60 bg-amber-500/10' : ''}
            `}
            style={{ clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)' }}
          >
            <span className="text-amber-300 font-bold">SYS</span>
          </div>
          {phase !== 'stance' && (
            <span className="text-amber-400/80 text-[10px] font-mono">
              {PROTOCOL_MODE_LABELS[protocolMode]}
            </span>
          )}
          <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500/80 rounded-full transition-all duration-500"
              style={{ width: `${(protocolHealth / PROTOCOL_MAX_DISPLAY) * 100}%` }}
            />
          </div>
          {protocolPrepared && phase === 'commit' && (
            <span className="text-amber-400 text-[10px] font-mono">NEXT +1</span>
          )}
        </div>
      </div>

      {currentModifier && (
        <div className="text-center text-amber-400/80 text-xs font-mono border border-amber-500/30 rounded px-3 py-1 shrink-0">
          {getModifierLabel(currentModifier)}
        </div>
      )}

      {/* Reveal modifier: show Protocol intent this round (free Probe for current round) */}
      {phase === 'commit' && currentModifier === 'Reveal' && revealedProtocolIntent !== null && (
        <div className="rounded bg-amber-500/10 border border-amber-500/40 px-3 py-2 text-center shrink-0">
          <p className="text-amber-300 text-xs font-mono">Protocol intent this round</p>
          <p className="text-amber-200 font-mono font-bold">{ACTION_LABELS[revealedProtocolIntent]}</p>
        </div>
      )}

      {/* Probe: reveals Protocol intent for next round (set when you used Probe last round) */}
      {phase === 'commit' && probeRevealedNextIntent !== null && (
        <div className="rounded bg-cyan-500/10 border border-cyan-500/40 px-3 py-2 text-center shrink-0">
          <p className="text-cyan-300 text-xs font-mono">Next round Protocol will</p>
          <p className="text-cyan-200 font-mono font-bold">{ACTION_LABELS[probeRevealedNextIntent]}</p>
          {probeRevealedRoundAfterNext !== null && (
            <>
              <p className="text-cyan-300/80 text-xs font-mono mt-1">Round after that</p>
              <p className="text-cyan-200/90 font-mono font-bold">{ACTION_LABELS[probeRevealedRoundAfterNext]}</p>
            </>
          )}
        </div>
      )}

      {phase === 'stance' && stanceChoices && (
        <div className="flex flex-col gap-3 shrink-0">
          <p className="text-white/60 text-sm text-center">Choose your stance</p>
          <div className="grid grid-cols-3 gap-2">
            {stanceChoices.map((stance) => (
              <button
                key={stance}
                type="button"
                onClick={() => chooseStance(stance)}
                className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 py-3 px-2 font-mono font-bold text-cyan-200 hover:bg-cyan-500/20 transition-colors flex flex-col items-center gap-0.5"
              >
                <span>{getStanceLabel(stance)}</span>
                <span className="text-[10px] font-normal text-cyan-300/80">{getStanceHint(stance)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {phase === 'commit' && (
        <div className="flex flex-col gap-3 shrink-0">
          {currentStance && (
            <p className="text-cyan-400/90 text-xs text-center font-mono">
              Stance: {getStanceLabel(currentStance)}
            </p>
          )}
          <p className="text-white/60 text-sm text-center">Choose an action</p>
          {charge >= 2 && (
            <label className="flex items-center justify-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={reinforce}
                onChange={(e) => setReinforce(e.target.checked)}
                className="rounded border-cyan-500/50 bg-cyan-500/10"
              />
              <span className="text-cyan-300 text-xs font-mono">Reinforce (+1 Charge)</span>
            </label>
          )}
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
        </div>
      )}

      {phase === 'reveal' && (
        <div className="flex flex-col gap-4 text-center shrink-0 animate-[cursed-reveal-in_0.3s_ease-out]">
          <p className="text-white/60 text-sm">
            {revealStep === 0 ? 'Protocol…' : revealStep === 1 ? 'You…' : 'Resolving…'}
          </p>
          <div className="flex justify-center gap-8">
            <div>
              <div className="text-cyan-400 text-xs">You</div>
              <div className="font-mono font-bold text-white min-w-[4rem]">
                {revealStep >= 1 && pendingPlayerAction ? ACTION_LABELS[pendingPlayerAction] : '—'}
              </div>
            </div>
            <div>
              <div className="text-amber-400/90 text-xs">Protocol</div>
              <div className="font-mono font-bold text-white min-w-[4rem]">
                {revealStep >= 0 && pendingProtocolAction ? ACTION_LABELS[pendingProtocolAction] : '—'}
              </div>
            </div>
          </div>
          {currentModifier === 'Reveal' && (
            <p className="text-white/50 text-xs">(Reveal modifier: intent shown)</p>
          )}
          {revealStep === 2 && <p className="text-white/40 text-sm animate-pulse">Resolving…</p>}
        </div>
      )}

      {phase === 'resolved' && lastRound && (
        <div className="flex flex-col gap-2 text-center shrink-0">
          <p className="text-white/60 text-sm">Result</p>
          <p className="font-mono text-sm text-white">
            You: {ACTION_LABELS[lastRound.playerAction]} — Protocol: {ACTION_LABELS[lastRound.protocolAction]}
          </p>
          <p className="text-white/80">
            {lastRound.protocolDamage > 0 && (
              <span className="text-cyan-400">Protocol -{lastRound.protocolDamage}</span>
            )}
            {lastRound.protocolDamage > 0 && lastRound.playerDamage > 0 && ' · '}
            {lastRound.playerDamage > 0 && (
              <span className="text-amber-400">You -{lastRound.playerDamage}</span>
            )}
            {lastRound.playerDamage === 0 && lastRound.protocolDamage === 0 && 'No damage'}
          </p>
          {lastRound.overdraw && (
            <p className="text-amber-400/80 text-xs">Overdraw penalty applied</p>
          )}
          <p className="text-white/40 text-sm">Next round...</p>
        </div>
      )}

      {log.length > 0 && (
        <div className="mt-auto border-t border-white/10 pt-3 shrink-0">
          <p className="text-white/40 text-xs font-mono mb-1">Last rounds</p>
          <ul className="text-xs font-mono text-white/60 space-y-0.5">
            {log.slice(0, 3).map((r, i) => (
              <li key={i}>
                {r.playerAction} vs {r.protocolAction} — You{' '}
                {r.playerDamage > 0 ? `-${r.playerDamage}` : '0'} / Protocol{' '}
                {r.protocolDamage > 0 ? `-${r.protocolDamage}` : '0'}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
    </>
  );
}
