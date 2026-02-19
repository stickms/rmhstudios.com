import type { RoundModifier } from './types';

const MUTATION_CHANCE = 0.2;
const MODIFIERS: RoundModifier[] = [
  'DoubleStrike',
  'NoBlock',
  'Chaos',
  'ChargeDrain',
  'Reveal',
];

export function rollMutation(chaosRun = false): RoundModifier | null {
  const chance = chaosRun ? MUTATION_CHANCE * 2 : MUTATION_CHANCE;
  if (Math.random() > chance) return null;
  return MODIFIERS[Math.floor(Math.random() * MODIFIERS.length)];
}

export function getModifierLabel(m: RoundModifier): string {
  switch (m) {
    case 'DoubleStrike':
      return 'Double Strike';
    case 'NoBlock':
      return 'No Block';
    case 'Chaos':
      return 'Chaos';
    case 'ChargeDrain':
      return 'Charge Drain';
    case 'Reveal':
      return 'Reveal';
    default:
      return String(m);
  }
}
