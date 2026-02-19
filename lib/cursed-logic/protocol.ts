import type { ProtocolAction, RoundState, ProtocolVariant, ProtocolMode } from './types';

const DEFAULT_WEIGHTS: Record<ProtocolAction, number> = {
  Strike: 40,
  Block: 30,
  Idle: 20,
  Prepare: 10,
};

const AGGRESSOR_WEIGHTS: Record<ProtocolAction, number> = {
  Strike: 55,
  Block: 20,
  Idle: 15,
  Prepare: 10,
};

const DEFENDER_WEIGHTS: Record<ProtocolAction, number> = {
  Strike: 25,
  Block: 50,
  Idle: 15,
  Prepare: 10,
};

const CHAOTIC_WEIGHTS: Record<ProtocolAction, number> = {
  Strike: 25,
  Block: 25,
  Idle: 25,
  Prepare: 25,
};

function getBaseWeights(variant: ProtocolVariant): Record<ProtocolAction, number> {
  switch (variant) {
    case 'aggressor':
      return { ...AGGRESSOR_WEIGHTS };
    case 'defender':
      return { ...DEFENDER_WEIGHTS };
    case 'chaotic':
      return { ...CHAOTIC_WEIGHTS };
    default:
      return { ...DEFAULT_WEIGHTS };
  }
}

function weightedPick(weights: Record<ProtocolAction, number>): ProtocolAction {
  const entries = Object.entries(weights) as [ProtocolAction, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [action, w] of entries) {
    r -= w;
    if (r <= 0) return action;
  }
  return entries[entries.length - 1][0];
}

export function getProtocolAction(state: RoundState): ProtocolAction {
  const w = getBaseWeights(state.protocolVariant);

  const mode = state.protocolMode ?? 'recovering';
  if (mode === 'pressuring') {
    w.Strike += 20;
    w.Block -= 5;
  } else if (mode === 'defensive') {
    w.Block += 20;
    w.Strike -= 5;
  }
  // recovering: no shift

  if (state.protocolPrepared) {
    w.Strike = 80;
    w.Block = 5;
    w.Idle = 5;
    w.Prepare = 10;
  }

  if (state.lastPlayerAction === 'Strike') {
    w.Block += 25;
  }

  const tier = state.protocolHealth <= 3 ? 'low' : state.protocolHealth <= 6 ? 'medium' : 'high';
  if (tier === 'low') {
    w.Strike += 15;
  } else if (tier === 'medium') {
    w.Block += 10;
  }

  let glitchChance = state.protocolVariant === 'chaotic' ? 0.25 : 0.1;
  if (state.chaosRun) glitchChance *= 2;
  let action = weightedPick(w);

  if (Math.random() < glitchChance) {
    const glitch: ProtocolAction[] = ['Strike', 'Block', 'Idle', 'Prepare'];
    action = glitch[Math.floor(Math.random() * glitch.length)];
  }

  return action;
}
