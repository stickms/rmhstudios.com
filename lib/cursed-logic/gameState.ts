import { create } from 'zustand';
import type {
  GameState as GameStateShape,
  PlayerAction,
  ProtocolAction,
  LastRound,
  RoundModifier,
  ProtocolVariant,
  RunUpgradeId,
  Stance,
  ProtocolMode,
  PlayerCondition,
  ProtocolCondition,
  MinigameKind,
} from './types';
import { applyMinigameAdjustment } from './minigame';
import {
  CHARGE_CAP,
  START_CHARGE,
  START_INTEGRITY,
  PROTOCOL_HEALTH,
} from './types';
import { pickRandomStances, getStanceEffect, INITIAL_STANCE_CHOICES } from './types';
import { rollMutation } from './mutations';

function nextProtocolMode(lastProtocolAction: ProtocolAction | null): ProtocolMode {
  if (!lastProtocolAction) return 'recovering';
  if (lastProtocolAction === 'Strike') return 'pressuring';
  if (lastProtocolAction === 'Block') return 'defensive';
  return 'recovering';
}

function nextPlayerCondition(
  playerAction: PlayerAction,
  protocolAction: ProtocolAction
): PlayerCondition {
  if (playerAction === 'Strike' && protocolAction === 'Block') return 'Overextended';
  if (playerAction === 'Prepare' && protocolAction === 'Strike') return 'Exposed';
  return null;
}

function nextProtocolCondition(
  playerAction: PlayerAction,
  protocolAction: ProtocolAction
): ProtocolCondition {
  if (protocolAction === 'Strike' && playerAction === 'Block') return 'Shaken';
  if (protocolAction === 'Prepare' && playerAction === 'Strike') return 'LockedIn';
  return null;
}

const MILESTONE_ROUNDS = [3, 6, 9];
const ALL_RUN_UPGRADES: RunUpgradeId[] = ['strikePlus1', 'blockReflect', 'probeReveals2', 'prepareHeal', 'chargeOnKill'];

function pickTwoMilestoneChoices(current: RunUpgradeId[]): [RunUpgradeId, RunUpgradeId] {
  const pool = ALL_RUN_UPGRADES.filter((u) => !current.includes(u));
  const a = pool[Math.floor(Math.random() * pool.length)] ?? 'strikePlus1';
  const b = pool.filter((u) => u !== a)[Math.floor(Math.random() * (pool.length - 1))] ?? 'blockReflect';
  return [a, b];
}

const initialState: GameStateShape = {
  phase: 'stance',
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
  revealedProtocolIntent: null,
  probeRevealedNextIntent: null,
  probeRevealedRoundAfterNext: null,
  protocolVariant: 'default',
  runUpgrades: [],
  milestoneChoices: null,
  runModifier: null,
  currentStance: null,
  stanceChoices: INITIAL_STANCE_CHOICES,
  reinforced: false,
  protocolMode: 'recovering',
  playerCondition: null,
  protocolCondition: null,
  revealStep: 0,
  minigameKind: null,
  minigameChaosDistort: false,
  pendingMinigameResolution: null,
};

interface CursedLogicStore extends GameStateShape {
  chooseStance: (stance: Stance) => void;
  commit: (action: PlayerAction, reinforced?: boolean) => void;
  setReveal: (protocolAction: ProtocolAction, probeRevealed?: ProtocolAction | null) => void;
  setRevealStep: (step: number) => void;
  applyResolution: (lastRound: LastRound, nextCharge: number, nextModifier: RoundModifier | null, skipExposed?: boolean) => void;
  setMinigamePending: (lastRound: LastRound, nextCharge: number, nextModifier: RoundModifier | null, kind: MinigameKind, chaosDistort: boolean) => void;
  completeMinigame: (success: boolean) => void;
  advanceToCommit: () => void;
  pickMilestone: (choice: RunUpgradeId) => void;
  setGameOver: (result: 'win' | 'lose') => void;
  setRevealedProtocolIntent: (action: ProtocolAction | null) => void;
  setProbeRevealedNextIntent: (action: ProtocolAction | null) => void;
  setProbeRevealedRoundAfterNext: (action: ProtocolAction | null) => void;
  resetGame: (overrides?: {
    startCharge?: number;
    startIntegrity?: number;
    protocolHealth?: number;
    protocolVariant?: ProtocolVariant;
    runModifier?: string;
  }) => void;
}

export const useCursedLogicStore = create<CursedLogicStore>()((set) => ({
  ...initialState,

  chooseStance: (stance) =>
    set((s) => {
      if (s.phase !== 'stance' || s.result || !s.stanceChoices) return s;
      if (!s.stanceChoices.includes(stance)) return s;
      const nextModifier = rollMutation(s.runModifier === 'chaosRun');
      return {
        currentStance: stance,
        currentModifier: nextModifier,
        phase: 'commit',
      };
    }),

  commit: (action, reinforced = false) =>
    set((s) => {
      if (s.phase !== 'commit' || s.result) return s;
      const cost = reinforced ? 2 : 1;
      if (s.charge < cost && s.charge > 0) return s; // can't reinforce without 2
      return {
        pendingPlayerAction: action,
        reinforced: reinforced && cost <= s.charge,
        phase: 'commit',
      };
    }),

  setReveal: (protocolAction, probeRevealed = null) =>
    set({
      phase: 'reveal',
      pendingProtocolAction: protocolAction,
      probeRevealedIntent: probeRevealed,
      revealStep: 0,
    }),

  setRevealStep: (step) => set({ revealStep: step }),

  applyResolution: (lastRound, nextCharge, nextModifier, skipExposed = false) =>
    set((s) => {
      let newIntegrity = Math.max(0, s.integrity - lastRound.playerDamage);
      const eff = getStanceEffect(s.currentStance);
      const prepareImmune = eff === 'prepare_immune';
      const prepareSucceeded =
        s.pendingPlayerAction === 'Prepare' &&
        (s.pendingProtocolAction !== 'Strike' || prepareImmune);
      if (prepareSucceeded && s.runUpgrades.includes('prepareHeal')) {
        newIntegrity = Math.min(10, newIntegrity + 1);
      }
      if (prepareSucceeded && eff === 'prepare_heal_one') {
        newIntegrity = Math.min(10, newIntegrity + 1);
      }
      const blockHealOne = eff === 'block_heal_one' && s.pendingPlayerAction === 'Block' && s.pendingProtocolAction === 'Strike';
      if (blockHealOne) {
        newIntegrity = Math.min(10, newIntegrity + 1);
      }
      if (eff === 'rally' && lastRound.protocolDamage > 0) {
        newIntegrity = Math.min(10, newIntegrity + 1);
      }
      let charge = nextCharge;
      if (eff === 'charge_on_damage' && lastRound.protocolDamage > 0) {
        charge = Math.min(s.chargeCap, charge + 1);
      }
      if (eff === 'second_wind' && s.pendingPlayerAction === 'Block') {
        charge = Math.min(s.chargeCap, charge + 1);
      }
      const newProtocolHealth = Math.max(0, s.protocolHealth - lastRound.protocolDamage);
      const log = [lastRound, ...s.log].slice(0, 5);
      const result = newIntegrity <= 0 ? 'lose' : newProtocolHealth <= 0 ? 'win' : null;
      const shouldMilestone =
        !result &&
        MILESTONE_ROUNDS.includes(s.round) &&
        s.runUpgrades.length === s.round / 3 - 1;
      const milestoneChoices = shouldMilestone ? pickTwoMilestoneChoices(s.runUpgrades) : null;
      const phase = result ? 'gameover' : shouldMilestone ? 'milestone' : 'resolved';
      const nextMode = nextProtocolMode(s.pendingProtocolAction);
      const nextPlayerCond = skipExposed ? null : nextPlayerCondition(s.pendingPlayerAction!, s.pendingProtocolAction!);
      const nextProtocolCond = nextProtocolCondition(s.pendingPlayerAction!, s.pendingProtocolAction!);
      return {
        lastRound,
        log,
        charge,
        integrity: newIntegrity,
        protocolHealth: newProtocolHealth,
        currentModifier: nextModifier,
        playerPrepared: prepareSucceeded,
        protocolPrepared:
          s.pendingProtocolAction === 'Prepare' && s.pendingPlayerAction !== 'Strike',
        pendingPlayerAction: null,
        pendingProtocolAction: null,
        probeRevealedIntent: null,
        revealedProtocolIntent: null,
        probeRevealedNextIntent: null,
        probeRevealedRoundAfterNext: null,
        currentStance: null,
        reinforced: false,
        protocolMode: nextMode,
        playerCondition: nextPlayerCond,
        protocolCondition: nextProtocolCond,
        revealStep: 0,
        minigameKind: null,
        minigameChaosDistort: false,
        pendingMinigameResolution: null,
        milestoneChoices,
        phase,
        result: result ?? s.result,
      };
    }),

  setMinigamePending: (lastRound, nextCharge, nextModifier, kind, chaosDistort) =>
    set({
      phase: 'minigame',
      minigameKind: kind,
      minigameChaosDistort: chaosDistort,
      pendingMinigameResolution: { lastRound, nextCharge, nextModifier },
    }),

  completeMinigame: (success) => {
    const s = useCursedLogicStore.getState();
    const pending = s.pendingMinigameResolution;
    if (s.phase !== 'minigame' || !pending || !s.minigameKind) return;
    const { lastRound, skipExposed } = applyMinigameAdjustment(
      pending.lastRound,
      success,
      s.minigameKind,
      s.minigameChaosDistort
    );
    useCursedLogicStore.getState().applyResolution(
      lastRound,
      pending.nextCharge,
      pending.nextModifier,
      skipExposed
    );
  },

  pickMilestone: (choice) =>
    set((s) => ({
      runUpgrades: [...s.runUpgrades, choice],
      milestoneChoices: null,
      phase: 'resolved',
    })),

  setRevealedProtocolIntent: (action) => set({ revealedProtocolIntent: action }),
  setProbeRevealedNextIntent: (action) => set({ probeRevealedNextIntent: action }),
  setProbeRevealedRoundAfterNext: (action) => set({ probeRevealedRoundAfterNext: action }),

  advanceToCommit: () =>
    set((s) => {
      if (s.result) return s;
      const chargeGain = s.currentModifier === 'ChargeDrain' ? 0 : 1;
      const nextCharge = Math.min(s.charge + chargeGain, s.chargeCap);
      return {
        phase: 'stance',
        round: s.round + 1,
        charge: nextCharge,
        stanceChoices: pickRandomStances(3),
      };
    }),

  setGameOver: (result) => set({ phase: 'gameover', result }),

  resetGame: (overrides) => {
    const mod = overrides?.runModifier ?? null;
    const startUpgrades: RunUpgradeId[] = [];
    if (mod === 'glassCannon') startUpgrades.push('strikePlus1');
    if (mod === 'probeMaster') startUpgrades.push('probeReveals2');
    set({
      ...initialState,
      phase: 'stance',
      stanceChoices: pickRandomStances(3),
      runModifier: mod,
      runUpgrades: startUpgrades,
      minigameKind: null,
      minigameChaosDistort: false,
      pendingMinigameResolution: null,
      ...(overrides && {
        charge: Math.min(overrides.startCharge ?? initialState.charge, overrides.runModifier === 'fortress' ? 6 : CHARGE_CAP),
        chargeCap: overrides.runModifier === 'fortress' ? 6 : CHARGE_CAP,
        integrity: overrides.startIntegrity ?? initialState.integrity,
        protocolHealth: overrides.protocolHealth ?? initialState.protocolHealth,
        protocolVariant: overrides.protocolVariant ?? initialState.protocolVariant,
      }),
    });
  },
}));
