import { create } from 'zustand';
import type {
  GameState as GameStateShape,
  PlayerAction,
  ProtocolAction,
  LastRound,
  RoundModifier,
} from './types';
import {
  CHARGE_CAP,
  START_CHARGE,
  START_INTEGRITY,
  PROTOCOL_HEALTH,
} from './types';

const initialState: GameStateShape = {
  phase: 'commit',
  round: 1,
  charge: START_CHARGE,
  integrity: START_INTEGRITY,
  protocolHealth: PROTOCOL_HEALTH,
  chargeCap: CHARGE_CAP,
  playerPrepared: false,
  protocolPrepared: false,
  currentModifier: null,
  lastRound: null,
  log: [],
  pendingPlayerAction: null,
  pendingProtocolAction: null,
  probeRevealedIntent: null,
  result: null,
};

interface CursedLogicStore extends GameStateShape {
  commit: (action: PlayerAction) => void;
  setReveal: (protocolAction: ProtocolAction, probeRevealed?: ProtocolAction | null) => void;
  applyResolution: (lastRound: LastRound, nextCharge: number, nextModifier: RoundModifier | null) => void;
  advanceToCommit: () => void;
  setGameOver: (result: 'win' | 'lose') => void;
  resetGame: () => void;
}

export const useCursedLogicStore = create<CursedLogicStore>()((set) => ({
  ...initialState,

  commit: (action) =>
    set((s) => {
      if (s.phase !== 'commit' || s.result) return s;
      return {
        pendingPlayerAction: action,
        phase: 'commit', // UI will transition to reveal after protocol picks
      };
    }),

  setReveal: (protocolAction, probeRevealed = null) =>
    set({
      phase: 'reveal',
      pendingProtocolAction: protocolAction,
      probeRevealedIntent: probeRevealed,
    }),

  applyResolution: (lastRound, nextCharge, nextModifier) =>
    set((s) => {
      const newIntegrity = Math.max(0, s.integrity - lastRound.playerDamage);
      const newProtocolHealth = Math.max(0, s.protocolHealth - lastRound.protocolDamage);
      const log = [lastRound, ...s.log].slice(0, 5);
      const result = newIntegrity <= 0 ? 'lose' : newProtocolHealth <= 0 ? 'win' : null;
      return {
        lastRound,
        log,
        charge: nextCharge,
        integrity: newIntegrity,
        protocolHealth: newProtocolHealth,
        currentModifier: nextModifier,
        playerPrepared: s.pendingPlayerAction === 'Prepare',
        protocolPrepared: s.pendingProtocolAction === 'Prepare',
        pendingPlayerAction: null,
        pendingProtocolAction: null,
        probeRevealedIntent: null,
        phase: result ? 'gameover' : 'resolved',
        result: result ?? s.result,
      };
    }),

  advanceToCommit: () =>
    set((s) => {
      if (s.result) return s;
      const chargeGain = s.currentModifier === 'ChargeDrain' ? 0 : 1;
      const nextCharge = Math.min(s.charge + chargeGain, s.chargeCap);
      return {
        phase: 'commit',
        round: s.round + 1,
        charge: nextCharge,
      };
    }),

  setGameOver: (result) => set({ phase: 'gameover', result }),

  resetGame: () => set(initialState),
}));
