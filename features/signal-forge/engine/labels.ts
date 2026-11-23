/**
 * English labels the UI looks up by a value (`wave.${w}`, `status.${k}`, `tier.${t}`, `act.${n}`). The UI passes
 * these as the `defaultValue` (English renders from defaults), and content-strings.ts writes them to the catalog.
 */
export const LABELS: Record<string, string> = {
  'wave.pulse': 'Pulse',
  'wave.sine': 'Sine',
  'wave.saw': 'Saw',
  'wave.noise': 'Noise',
  'status.weak': 'Weak: deals 25% less',
  'status.vuln': 'Vulnerable: takes 50% more',
  'status.bleed': 'Bleed: loses this much HP each turn',
  'status.strength': 'Strength: adds to every hit',
  'status.frail': 'Frail: gains 25% less Block',
  'status.jam': 'Jammed: skips its next move',
  'tier.normal': 'enemy',
  'tier.elite': 'elite',
  'tier.boss': 'boss',
  'tier.minion': 'minion',
  'act.1': 'The Foundry Floor',
  'act.2': 'The Coil Halls',
  'act.3': 'The Heart',
};

export function label(key: string): string {
  return LABELS[key] ?? key;
}
