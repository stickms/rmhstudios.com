import type { MilestoneDef } from '@/lib/temple-of-joy/types';

export const MILESTONES: MilestoneDef[] = [
  { id: 'ms_1e3',  threshold: 1_000,           label: 'First Light',    hpsBonus: 0.5 },
  { id: 'ms_1e4',  threshold: 10_000,           label: 'The Spark',      hpsBonus: 2 },
  { id: 'ms_1e5',  threshold: 100_000,          label: 'The Flame',      hpsBonus: 10 },
  { id: 'ms_1e6',  threshold: 1_000_000,        label: 'The Pyre',       hpsMultiplier: 1.05 },
  { id: 'ms_1e7',  threshold: 10_000_000,       label: 'The Bonfire',    hpsMultiplier: 1.05 },
  { id: 'ms_1e8',  threshold: 100_000_000,      label: 'The Beacon',     hpsMultiplier: 1.1 },
  { id: 'ms_1e9',  threshold: 1_000_000_000,    label: 'The Sun',        hpsMultiplier: 1.1 },
  { id: 'ms_1e12', threshold: 1e12,             label: 'Transcendence',  hpsMultiplier: 1.1 },
  { id: 'ms_1e15', threshold: 1e15,             label: 'The Blessed',    hpsMultiplier: 1.15 },
  { id: 'ms_1e18', threshold: 1e18,             label: 'The Holy',       hpsMultiplier: 1.15 },
  { id: 'ms_1e21', threshold: 1e21,             label: 'The Sacred',     hpsMultiplier: 1.2 },
  { id: 'ms_1e24', threshold: 1e24,             label: 'The Divine',     hpsMultiplier: 1.2 },
  { id: 'ms_1e27', threshold: 1e27,             label: 'The Eternal',    hpsMultiplier: 1.25 },
  { id: 'ms_1e30', threshold: 1e30,             label: 'The Infinite',   hpsMultiplier: 1.25 },
  { id: 'ms_1e33', threshold: 1e33,             label: 'The Omniscient', hpsMultiplier: 1.3 },
  { id: 'ms_1e36', threshold: 1e36,             label: 'Beyond Words',   hpsMultiplier: 1.3 },
  { id: 'ms_1e39', threshold: 1e39,             label: 'The Wordless',   hpsMultiplier: 1.35 },
  { id: 'ms_1e42', threshold: 1e42,             label: 'Pure Bliss',     hpsMultiplier: 1.5 },
  { id: 'ms_1e45', threshold: 1e45,             label: 'Unfathomable',   hpsMultiplier: 1.5 },
  { id: 'ms_1e48', threshold: 1e48,             label: 'Joy Eternal',    hpsMultiplier: 2.0 },
];
