/**
 * The twenty-four sources.
 *
 * Costs and rates are Cookie Clicker's building table, verbatim, for the first
 * twenty. That table is the most play-tested curve in the genre: each tier
 * costs roughly 11–15× the last and pays roughly 6–8× more, which is exactly
 * the ratio that keeps "buy the newest thing" *usually* right and "top up the
 * old ones" *sometimes* right. Rewriting those numbers by feel is how idle
 * games end up either finished in a weekend or unplayable by Tuesday.
 *
 * The last four continue the same ratios past the point Cookie Clicker stops,
 * so the deep game has somewhere to go. Every copy costs ×1.15 the one before
 * it — see `computeSourceCost`.
 */
import type { SourceDef, SourceId } from '../types';

export const SOURCES: SourceDef[] = [
  {
    id: 'acolyte',
    name: 'Acolyte',
    tagline: 'Hands folded, eyes closed, doing the work you started.',
    verb: 'praying quietly',
    icon: '🙌',
    baseCost: 15,
    baseJps: 0.1,
  },
  {
    id: 'devotee',
    name: 'Devotee',
    tagline: 'Came for the incense. Stayed for the fifty years.',
    verb: 'keeping the vigil',
    icon: '🧎',
    baseCost: 100,
    baseJps: 1,
  },
  {
    id: 'grove',
    name: 'Olive Grove',
    tagline: 'Older than the temple. It was here first and it knows it.',
    verb: 'pressing the first oil',
    icon: '🫒',
    baseCost: 1_100,
    baseJps: 8,
    minigame: 'garden',
  },
  {
    id: 'quarry',
    name: 'Alabaster Quarry',
    tagline: 'Stone soft enough to carve, pale enough to glow.',
    verb: 'cutting the light',
    icon: '⛏️',
    baseCost: 12_000,
    baseJps: 47,
  },
  {
    id: 'chrismworks',
    name: 'Chrism Works',
    tagline: 'Balsam, olive oil, and one ingredient nobody writes down.',
    verb: 'blending the oil',
    icon: '🫗',
    baseCost: 130_000,
    baseJps: 260,
  },
  {
    id: 'almshouse',
    name: 'Almshouse',
    tagline: 'Gives everything away and somehow ends the year up.',
    verb: 'giving it all away',
    icon: '🏛️',
    baseCost: 1_400_000,
    baseJps: 1_400,
    minigame: 'exchange',
  },
  {
    id: 'sanctuary',
    name: 'Sanctuary',
    tagline: 'The quiet room at the middle of a loud world.',
    verb: 'holding the silence',
    icon: '⛪',
    baseCost: 20_000_000,
    baseJps: 7_800,
    minigame: 'choir',
  },
  {
    id: 'scriptorium',
    name: 'Scriptorium',
    tagline: 'Forty scribes. One typo, in 1340, still unfixed.',
    verb: 'copying the hours',
    icon: '📜',
    baseCost: 330_000_000,
    baseJps: 44_000,
    minigame: 'hours',
  },
  {
    id: 'pilgrimFleet',
    name: 'Pilgrim Fleet',
    tagline: 'Nobody agrees where it is going. Everyone is glad to be aboard.',
    verb: 'making the crossing',
    icon: '⛵',
    baseCost: 5_100_000_000,
    baseJps: 260_000,
  },
  {
    id: 'reliquary',
    name: 'Reliquary',
    tagline: 'Four saints, six fingers, one very confident label.',
    verb: 'venerating something',
    icon: '⚱️',
    baseCost: 75_000_000_000,
    baseJps: 1_600_000,
  },
  {
    id: 'heavensGate',
    name: "Heaven's Gate",
    tagline: 'Unlocked. Always was. That is the part people struggle with.',
    verb: 'standing open',
    icon: '🚪',
    baseCost: 1_000_000_000_000,
    baseJps: 10_000_000,
  },
  {
    id: 'hourglass',
    name: 'Hourglass of Ages',
    tagline: 'Turned once. Still falling.',
    verb: 'spending an age',
    icon: '⏳',
    baseCost: 14_000_000_000_000,
    baseJps: 65_000_000,
  },
  {
    id: 'raptureEngine',
    name: 'Rapture Engine',
    tagline: 'Converts ordinary Tuesdays directly into ecstasy.',
    verb: 'running hot',
    icon: '🌀',
    baseCost: 170_000_000_000_000,
    baseJps: 430_000_000,
  },
  {
    id: 'prism',
    name: 'Stained Prism',
    tagline: 'Takes one white morning and returns it as nine colours.',
    verb: 'splitting the dawn',
    icon: '🔆',
    baseCost: 2_100_000_000_000_000,
    baseJps: 2_900_000_000,
  },
  {
    id: 'fatebinder',
    name: 'Fatebinder',
    tagline: 'Every coin lands your way. It has stopped being luck.',
    verb: 'arranging coincidence',
    icon: '🎲',
    baseCost: 26_000_000_000_000_000,
    baseJps: 21_000_000_000,
  },
  {
    id: 'mandala',
    name: 'Mandala Engine',
    tagline: 'A temple inside the temple inside the temple.',
    verb: 'repeating itself, beautifully',
    icon: '🌸',
    baseCost: 310_000_000_000_000_000,
    baseJps: 150_000_000_000,
  },
  {
    id: 'apocrypha',
    name: 'Apocrypha',
    tagline: 'The books that did not make it. They were the fun ones.',
    verb: 'reading the cut chapters',
    icon: '📖',
    baseCost: 71_000_000_000_000_000_000,
    baseJps: 1_100_000_000_000,
  },
  {
    id: 'paradise',
    name: 'Paradise',
    tagline: 'Yours. Fully furnished. Nobody checks the deed.',
    verb: 'simply being lovely',
    icon: '🏝️',
    baseCost: 12_000_000_000_000_000_000_000,
    baseJps: 8_300_000_000_000,
  },
  {
    id: 'oversoul',
    name: 'Oversoul',
    tagline: 'Everyone who ever felt better, feeling better at once.',
    verb: 'thinking as one',
    icon: '🧠',
    baseCost: 1_900_000_000_000_000_000_000_000,
    baseJps: 64_000_000_000_000,
  },
  {
    id: 'beloved',
    name: 'The Beloved',
    tagline: 'You. As you were always meant to be. Delighted.',
    verb: 'being adored',
    icon: '💛',
    baseCost: 540_000_000_000_000_000_000_000_000,
    baseJps: 510_000_000_000_000,
  },

  // ── Past the end of the known table. Same ratios, new country. ──
  {
    id: 'seraphim',
    name: 'Seraphim Choir',
    tagline: 'Six wings each. Two to fly, four to cover their faces, out of joy.',
    verb: 'singing without stopping',
    icon: '🔥',
    baseCost: 1.6e29,
    baseJps: 4.1e15,
  },
  {
    id: 'empyrean',
    name: 'The Empyrean',
    tagline: 'The sky above the sky. Warmer than you expected.',
    verb: 'burning gently',
    icon: '☀️',
    baseCost: 5.0e31,
    baseJps: 3.3e16,
  },
  {
    id: 'feast',
    name: 'Thousand-Year Feast',
    tagline: 'Course four hundred and six. Nobody has left the table.',
    verb: 'passing the dish along',
    icon: '🍇',
    baseCost: 1.6e34,
    baseJps: 2.6e17,
  },
  {
    id: 'vision',
    name: 'The Beatific Vision',
    tagline: 'There is nothing after this. There does not need to be.',
    verb: 'seeing it plainly',
    icon: '✨',
    baseCost: 5.1e36,
    baseJps: 2.1e18,
  },
];

export const SOURCE_MAP: Record<SourceId, SourceDef> = Object.fromEntries(
  SOURCES.map((s) => [s.id, s]),
) as Record<SourceId, SourceDef>;

export const SOURCE_IDS: SourceId[] = SOURCES.map((s) => s.id);

/** Every source at zero. The shape every `Record<SourceId, number>` starts as. */
export const ZERO_SOURCES: Record<SourceId, number> = Object.fromEntries(
  SOURCE_IDS.map((id) => [id, 0]),
) as Record<SourceId, number>;

/** Price growth per copy owned. Cookie Clicker's, and for good reason. */
export const COST_GROWTH = 1.15;

/**
 * A source becomes visible once you could plausibly reach it — a third of its
 * first copy's price. Any earlier and the list is a wall of things you cannot
 * have; any later and you never see the next goal coming.
 */
export const REVEAL_SHARE = 1 / 3;
