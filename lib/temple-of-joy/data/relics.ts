import type { RelicDef, RelicId } from '@/lib/temple-of-joy/types';

export const RELICS: RelicDef[] = [
  {
    id: 'epicurusRing',
    name: "Epicurus's Ring",
    description: 'All Philosophical upgrades cost 50% less.',
    flavorText: '"Simple pleasures. Absence of pain."',
    karmaCost: 250,
  },
  {
    id: 'laurelCrown',
    name: 'The Laurel Crown',
    description: '×2 HPS while idle (no click in 10+ seconds).',
    flavorText: '"Earned through victory. Or a very long nap."',
    karmaCost: 150,
  },
  {
    id: 'incenseOfAncients',
    name: 'Incense of the Ancients',
    description: 'Doubles Ritual burst. Ritual cooldown halved.',
    flavorText: '"Ancient smoke. Ancient power. Ancient smell."',
    karmaCost: 350,
  },
  {
    id: 'stuffedPillow',
    name: 'The Stuffed Pillow',
    description: '×3 Nap Pod HPS. Pilgrimage burst ×1.5.',
    flavorText: '"Filled with something softer than feathers."',
    karmaCost: 100,
  },
  {
    id: 'goldenFork',
    name: 'Golden Fork',
    description: '×4 Feast Hall HPS. ×2 Snack Bar HPS.',
    flavorText: '"Only the finest utensils for the feast eternal."',
    karmaCost: 180,
  },
  {
    id: 'confessionBooth',
    name: 'The Confession Booth',
    description: '+5% HPS per Bliss Shard owned.',
    flavorText: '"You confessed. It counted toward the total."',
    karmaCost: 600,
  },
  {
    id: 'vibeCrystal',
    name: 'Vibe Crystal',
    description: 'Vibe Check rewards doubled.',
    flavorText: '"Certified good vibes. Geologically confirmed."',
    karmaCost: 120,
  },
  {
    id: 'philosophersStone',
    name: "The Philosopher's Stone (Joy)",
    description: '×2 all multipliers.',
    flavorText: '"They said it couldn\'t be done. They were wrong about happiness, too."',
    karmaCost: 2000,
  },
  {
    id: 'warmBlanket',
    name: 'The Warm Blanket (Eternal)',
    description: 'Idle HPS equals active HPS at all times.',
    flavorText: '"It has always been there. It will always be there."',
    karmaCost: 300,
  },
  {
    id: 'sacredLedger',
    name: 'The Sacred Ledger',
    description: 'HPS increases ×0.1 per minute on page, up to ×5. Resets on reload.',
    flavorText: '"Every moment accounted for. Every moment rewarded."',
    karmaCost: 500,
  },
  {
    id: 'hymnalOfExcess',
    name: 'The Hymnal of Excess',
    description: 'Each source type gains ×1.01^owned compound bonus (per type).',
    flavorText: '"Sung louder with every verse. Verse count: increasing."',
    karmaCost: 1200,
  },
  {
    id: 'eternalNap',
    name: 'The Eternal Nap',
    description: 'Offline progress calculated as if actively clicking.',
    flavorText: '"You closed the tab. The temple continued."',
    karmaCost: 800,
  },
  // ── Post-Prestige Relics ──
  {
    id: 'karmaResonator',
    name: 'Karma Resonator',
    description: '×2 Karma gain rate. Milestones grant ×1.5 bonus.',
    flavorText: '"The resonance builds. The universe hums along."',
    karmaCost: 3000,
  },
  {
    id: 'lighthouseOfJoy',
    name: 'Lighthouse of Joy',
    description: '×3 HPS for all post-prestige sources.',
    flavorText: '"A beacon visible across lifetimes. Check-in is eternal."',
    karmaCost: 6000,
  },
  {
    id: 'temporalComfort',
    name: 'Temporal Comfort',
    description: 'All timed buffs last 50% longer. Event frequency +25%.',
    flavorText: '"Time bends around comfort. Comfort bends around you."',
    karmaCost: 4000,
  },
  {
    id: 'infiniteGratitude',
    name: 'Infinite Gratitude',
    description: 'Each prestige permanently adds +2% HPS (uncapped).',
    flavorText: '"Grateful for every cycle. More grateful each time."',
    karmaCost: 12000,
  },
  // ── New Relics ────────────────────────────────────────────────────────────
  {
    id: 'bubbleTeaCard',
    name: 'Bubble Tea Loyalty Card',
    description: '×3 Sweet Treat HPS.',
    flavorText: '"Tenth cup free. You have lost count of how many free cups you\'ve received."',
    karmaCost: 80,
  },
  {
    id: 'cozyPlaylist',
    name: 'The Playlist (Correct)',
    description: '+15% global HPS.',
    flavorText: '"Every song was right. In order. Nobody knows how."',
    karmaCost: 200,
  },
  {
    id: 'zenBell',
    name: 'The Zen Bell',
    description: 'Vibe Check buffs last 2× longer. +1 karma/s permanently.',
    flavorText: '"One strike. Reverberates forever."',
    karmaCost: 450,
  },
  {
    id: 'nappingCat',
    name: 'The Napping Cat',
    description: 'Pilgrimage duration −50%. Pilgrimage burst ×2.',
    flavorText: '"It knows. It naps anyway. This is the lesson."',
    karmaCost: 130,
  },
];

export const RELIC_MAP: Record<RelicId, RelicDef> = Object.fromEntries(
  RELICS.map((r) => [r.id, r])
) as Record<RelicId, RelicDef>;
