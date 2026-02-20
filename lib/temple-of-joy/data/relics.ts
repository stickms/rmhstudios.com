import type { RelicDef, RelicId } from '@/lib/temple-of-joy/types';

export const RELICS: RelicDef[] = [
  {
    id: 'epicurusRing',
    name: "Epicurus's Ring",
    description: 'All Philosophical upgrades cost 50% less.',
    flavorText: '"Simple pleasures. Absence of pain."',
    karmaCost: 50,
  },
  {
    id: 'laurelCrown',
    name: 'The Laurel Crown',
    description: '×2 HPS while idle (no click in 10+ seconds).',
    flavorText: '"Earned through victory. Or a very long nap."',
    karmaCost: 40,
  },
  {
    id: 'incenseOfAncients',
    name: 'Incense of the Ancients',
    description: 'Doubles Ritual burst. Ritual cooldown halved.',
    flavorText: '"Ancient smoke. Ancient power. Ancient smell."',
    karmaCost: 60,
  },
  {
    id: 'stuffedPillow',
    name: 'The Stuffed Pillow',
    description: '×3 Nap Pod HPS. Pilgrimage burst ×1.5.',
    flavorText: '"Filled with something softer than feathers."',
    karmaCost: 30,
  },
  {
    id: 'goldenFork',
    name: 'Golden Fork',
    description: '×4 Feast Hall HPS. ×2 Snack Bar HPS.',
    flavorText: '"Only the finest utensils for the feast eternal."',
    karmaCost: 45,
  },
  {
    id: 'confessionBooth',
    name: 'The Confession Booth',
    description: '+5% HPS per Bliss Shard owned.',
    flavorText: '"You confessed. It counted toward the total."',
    karmaCost: 80,
  },
  {
    id: 'vibeCrystal',
    name: 'Vibe Crystal',
    description: 'Vibe Check rewards doubled.',
    flavorText: '"Certified good vibes. Geologically confirmed."',
    karmaCost: 35,
  },
  {
    id: 'philosophersStone',
    name: "The Philosopher's Stone (Joy)",
    description: '×2 all multipliers.',
    flavorText: '"They said it couldn\'t be done. They were wrong about happiness, too."',
    karmaCost: 150,
  },
  {
    id: 'warmBlanket',
    name: 'The Warm Blanket (Eternal)',
    description: 'Idle HPS equals active HPS at all times.',
    flavorText: '"It has always been there. It will always be there."',
    karmaCost: 55,
  },
  {
    id: 'sacredLedger',
    name: 'The Sacred Ledger',
    description: 'HPS increases ×0.1 per minute on page, up to ×5. Resets on reload.',
    flavorText: '"Every moment accounted for. Every moment rewarded."',
    karmaCost: 70,
  },
  {
    id: 'hymnalOfExcess',
    name: 'The Hymnal of Excess',
    description: 'Each building type gains ×1.01^owned compound bonus (per type).',
    flavorText: '"Sung louder with every verse. Verse count: increasing."',
    karmaCost: 100,
  },
  {
    id: 'eternalNap',
    name: 'The Eternal Nap',
    description: 'Offline progress calculated as if actively clicking.',
    flavorText: '"You closed the tab. The temple continued."',
    karmaCost: 90,
  },
];

export const RELIC_MAP: Record<RelicId, RelicDef> = Object.fromEntries(
  RELICS.map((r) => [r.id, r])
) as Record<RelicId, RelicDef>;
