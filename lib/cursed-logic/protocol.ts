import type { ProtocolAction, RoundState } from './types';

const BASE_WEIGHTS: Record<ProtocolAction, number> = {
  Strike: 40,
  Block: 30,
  Idle: 20,
  Prepare: 10,
};

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
  const w = { ...BASE_WEIGHTS };

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

  let action = weightedPick(w);

  if (Math.random() < 0.1) {
    const glitch: ProtocolAction[] = ['Strike', 'Block', 'Idle', 'Prepare'];
    action = glitch[Math.floor(Math.random() * glitch.length)];
  }

  return action;
}
