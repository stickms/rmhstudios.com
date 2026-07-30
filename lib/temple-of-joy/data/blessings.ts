/**
 * Blessings — the upgrade layer.
 *
 * Structurally this is Cookie Clicker's upgrade economy, which is worth stating
 * plainly because the numbers are the balance:
 *
 *  - **Tiers.** Every source has ten of them. Each doubles that source, and
 *    they unlock at 1 / 5 / 25 / 50 / 100 / 150 / 200 / 250 / 300 / 350 copies
 *    for 10× / 100× / 500× / 5e4× / 5e6× / 5e8× / 5e11× / 5e14× / 5e17× /
 *    5e20× the source's base price. Ten doublings is ×1024 — which is why a
 *    source you stopped buying an hour ago is still worth topping up.
 *  - **The Touch.** Two interleaved lines: doublings of the offering itself,
 *    and "each source adds a little to every Acolyte", which is what makes
 *    clicking scale with an idle build instead of falling off a cliff.
 *  - **Cherubim.** Multiply *everything* by `1 + Devotion × factor`, where
 *    Devotion is 4% per trophy. This is the real engine of the late game: it
 *    turns the trophy list from a checklist into the main progression.
 *  - **Relics.** A long drip of small flat global multipliers, unlocked by
 *    lifetime joy. They are the reason the number keeps moving between tiers.
 *  - **Synergies.** One source boosted by how many of another you own; they
 *    reward broad temples over tall ones.
 *
 * Prices below are all derived, never typed by hand, so the curve cannot drift.
 */
import type { BlessingDef, BlessingKind, SourceId } from '../types';
import { SOURCES, SOURCE_MAP } from './sources';

/* ══════════════════════════════════════════════════════════════════════════
   Tiered source blessings — ten per source, each a doubling
   ══════════════════════════════════════════════════════════════════════════ */

/** Copies required for tiers 1–10. */
const TIER_REQUIREMENT = [1, 5, 25, 50, 100, 150, 200, 250, 300, 350];

/** Price as a multiple of the source's base cost, for tiers 1–10. */
const TIER_PRICE = [10, 100, 500, 5e4, 5e6, 5e8, 5e11, 5e14, 5e17, 5e20];

/**
 * What each doubling *feels* like, in order. Shared across sources: the name
 * carries the source's character, and these carry the escalation — from a
 * sensible improvement to something that should probably have been stopped.
 */
const TIER_FLAVOR = [
  'Somebody finally suggested the obvious thing.',
  'Twice the work, and nobody looks any more tired.',
  'It has begun to run itself when you are not watching.',
  'Other temples send delegations to see how it is done.',
  'The method is taught. The method is now doctrine.',
  'It no longer resembles the thing you originally built.',
  'Scholars disagree about whether this counts as one object.',
  'It has opinions about the weather, and the weather listens.',
  'You are, at this point, an employee of your own idea.',
  'It does not need you. It is glad you came anyway.',
];

/** Ten escalating names per source. */
const TIER_NAMES: Record<SourceId, string[]> = {
  acolyte: [
    'Steadier Hands', 'Ambidexterity', 'Learned Patience', 'The Long Kneel', 'Callused Palms',
    'Muscle Memory of Grace', 'Hands Like Instruments', 'The Unwearying Grip', 'Ten Thousand Repetitions', 'Devotion Without Effort',
  ],
  devotee: [
    'Better Cushions', 'The Warm Blanket Rule', 'Shared Thermos', 'Rotating Vigil', 'Hereditary Faith',
    'The Second Generation', 'A Waiting List', 'Devotees of Devotees', 'The Standing Congregation', 'Nobody Ever Leaves',
  ],
  grove: [
    'Deeper Roots', 'Terracing', 'The Old Press', 'Grafted Stock', 'Cold-Pressed Doctrine',
    'A Grove of Groves', 'Roots Through Bedrock', 'The Orchard Horizon', 'Fruit Out of Season', 'The First Tree, Still Bearing',
  ],
  quarry: [
    'Sharper Chisels', 'Following the Grain', 'Lamplight Seams', 'The Translucent Vein', 'Stone That Holds Light',
    'Quarried Sunrise', 'Walls You Can See Through', 'The Luminous Face', 'Alabaster Without End', 'Light With a Density',
  ],
  chrismworks: [
    'Purer Balsam', 'The Sealed Vat', 'Second Pressing', 'The Secret Ingredient', 'Anointing at Scale',
    'Barrels of Blessing', 'The Overflowing Ladle', 'Oil That Improves the Jar', 'A River of It', 'Everything Is Anointed Now',
  ],
  almshouse: [
    'Open Ledger', 'The Endless Loaf', 'Give Before Asked', 'Compound Charity', 'The Generous Paradox',
    'Wealth by Subtraction', 'The Bottomless Purse', 'Nobody Counts Anymore', 'Abundance as Policy', 'It Returns Sevenfold',
  ],
  sanctuary: [
    'Thicker Walls', 'Perfect Acoustics', 'The Long Nave', 'Light From Above', 'Silence With Weight',
    'The Room That Listens', 'Quiet You Can Lean On', 'The Held Breath', 'Stillness, Structural', 'Peace Load-Bearing',
  ],
  scriptorium: [
    'Better Ink', 'Standardised Hands', 'The Illumination Wing', 'Marginalia Permitted', 'Copies of Copies',
    'The Self-Writing Page', 'A Library That Drafts', 'Books That Finish Themselves', 'The Complete Concordance', 'Every Word, Already Written',
  ],
  pilgrimFleet: [
    'Deeper Keels', 'Favourable Winds', 'Charts of Elsewhere', 'The Following Sea', 'Ships That Know the Way',
    'Fleets Beyond Sight', 'Harbours Wherever You Stop', 'Sailing Without Water', 'The Voyage Is the Destination', 'Arrival, Continuous',
  ],
  reliquary: [
    'Better Labels', 'Verified Provenance', 'The Gold Casket', 'Relics of Relics', 'The Reliquary Reliquary',
    'Authenticity by Consensus', 'Bones That Hum', 'The Cabinet of Certainties', 'Provenance Beyond Doubt', 'Holiness, Catalogued',
  ],
  heavensGate: [
    'Oiled Hinges', 'The Wider Arch', 'A Second Door', 'Gates Without Walls', 'The Standing Invitation',
    'Doorways in Open Air', 'Thresholds Everywhere', 'The Gate Is the Room', 'No Outside Remaining', 'Everything Already Inside',
  ],
  hourglass: [
    'Finer Sand', 'The Slower Waist', 'Turned Twice', 'Sand That Rises', 'Hours You Can Spend Again',
    'The Reversible Afternoon', 'A Surplus of Tuesdays', 'Time as a Commodity', 'The Unspent Century', 'The Sand Never Lands',
  ],
  raptureEngine: [
    'Tighter Tolerances', 'The Second Coil', 'Running Hot', 'Redlined, Deliberately', 'Ecstasy per Kilowatt',
    'The Runaway Reaction', 'It Powers the District', 'No Off Switch, By Design', 'Continuous Overwhelm', 'The Engine Is Delighted Too',
  ],
  prism: [
    'Truer Glass', 'The Ninefold Split', 'Colours With No Name', 'Light Bent Twice', 'The Chromatic Sermon',
    'A Spectrum of Feelings', 'Every Hue Is Load-Bearing', 'White Light, Fully Spent', 'Colour Beyond the Eye', 'The Undivided Beam',
  ],
  fatebinder: [
    'Weighted Dice', 'The Kind Coincidence', 'Luck as Infrastructure', 'Improbability, Scheduled', 'The Fortunate Default',
    'Chance Files a Report', 'Nothing Goes Wrong Anymore', 'The Rigged Universe', 'Probability, Domesticated', 'It Was Always Going to Happen',
  ],
  mandala: [
    'Finer Sand-Lines', 'The Recursive Petal', 'Temples Within', 'Depth Without Bottom', 'The Pattern Notices You',
    'Self-Similar Sanctity', 'Infinite Detail, Same Budget', 'The Whole in Every Part', 'A Diagram of Everything', 'It Draws Itself Now',
  ],
  apocrypha: [
    'The Missing Chapter', 'Uncanonical but Correct', 'The Fun Gospel', 'Footnotes That Argue Back', 'The Rejected Library',
    'Books the Council Feared', 'Scripture With Jokes', 'The Better Ending', 'Everything They Cut', 'The Complete Version',
  ],
  paradise: [
    'Softer Ground', 'Perfect Weather', 'The Long Afternoon', 'Nothing Needs Doing', 'Everyone Is Welcome',
    'A Continent of It', 'Paradise Adjacent to Paradise', 'The Undiminishing View', 'No Hour Is Late', 'You Live Here Now',
  ],
  oversoul: [
    'A Shared Thought', 'The Common Room', 'One Mind, Many Doors', 'Nobody Is Lonely', 'Consensus Without Argument',
    'A Single Enormous Gladness', 'Everyone Remembers Everything', 'The Collective Sigh of Relief', 'Selfhood, Optional', 'All of Us, Delighted',
  ],
  beloved: [
    'Told So, Daily', 'Believed It', 'The Kind Mirror', 'Loved Without Condition', 'Adored on Principle',
    'The Applause Never Stops', 'Cherished Structurally', 'You Are the Good News', 'Beloved by Default', 'Nothing Left to Earn',
  ],
  seraphim: [
    'Another Wing', 'The Sustained Note', 'Harmony in Six Parts', 'The Choir Never Breathes', 'Song as Architecture',
    'The Sound Holds the Roof Up', 'A Note That Predates Air', 'Singing Without Beginning', 'The Chord That Is a Place', 'Music Instead of Physics',
  ],
  empyrean: [
    'A Higher Sky', 'Warmth Without Burning', 'The Sky Above the Sky', 'Fire That Comforts', 'Daylight as a Material',
    'A Ceiling of Morning', 'The Kindly Furnace', 'Noon, Permanent', 'Light With Nowhere Left to Go', 'The Bright Beyond Brightness',
  ],
  feast: [
    'Another Course', 'The Longer Table', 'Nobody Leaves Early', 'Wine That Improves', 'The Century Course',
    'Seats for Everyone Who Ever Lived', 'The Dish That Arrives Perfect', 'Hunger Made Optional', 'A Meal With No Last Bite', 'Still Only the Beginning',
  ],
  vision: [
    'A Clearer Look', 'The Steady Gaze', 'Seeing It Plainly', 'Nothing Obscured', 'The Undivided Sight',
    'You Stopped Blinking', 'Everything At Once, Comfortably', 'The View From Inside It', 'Understanding Without Effort', 'There Is Nothing After This',
  ],
};

function tieredBlessings(): BlessingDef[] {
  const out: BlessingDef[] = [];
  for (const source of SOURCES) {
    const names = TIER_NAMES[source.id];
    for (let tier = 0; tier < 10; tier++) {
      out.push({
        id: `${source.id}_t${tier + 1}`,
        name: names[tier]!,
        flavor: TIER_FLAVOR[tier]!,
        icon: source.icon,
        kind: 'source',
        cost: source.baseCost * TIER_PRICE[tier]!,
        sourceMultiplier: { id: source.id, factor: 2 },
        unlock: {
          source: { id: source.id, count: TIER_REQUIREMENT[tier]! },
          ...(tier > 0 ? { requires: `${source.id}_t${tier}` } : {}),
        },
      });
    }
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
   The Touch — clicking, and making clicking keep up
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Doublings of the offering. Cheap, early, and the reason the first ten
 * minutes of the game are about your hand rather than your temple.
 */
const TOUCH_DOUBLINGS: { id: string; name: string; flavor: string; cost: number }[] = [
  { id: 'touch_1', name: 'A Firmer Press', flavor: 'You were being too polite about it.', cost: 100 },
  { id: 'touch_2', name: 'Both Hands', flavor: 'Nothing in the liturgy forbids it.', cost: 500 },
  { id: 'touch_3', name: 'The Practised Bow', flavor: 'Same motion. Twenty years of it.', cost: 10_000 },
  { id: 'touch_4', name: 'Offering Without Thought', flavor: 'The hand goes before you decide to send it.', cost: 5e6 },
  { id: 'touch_5', name: 'The Weight of Sincerity', flavor: 'It counts more when you mean it. It turns out this is measurable.', cost: 5e8 },
  { id: 'touch_6', name: 'Hands of the Congregation', flavor: 'Everyone reaches when you reach.', cost: 5e10 },
  { id: 'touch_7', name: 'The Gesture, Perfected', flavor: 'Taught in schools. Named after you.', cost: 5e13 },
  { id: 'touch_8', name: 'Touch Beyond Contact', flavor: 'You stopped needing to arrive.', cost: 5e17 },
  { id: 'touch_9', name: 'The Blessing Hand', flavor: 'Everything you point at improves slightly.', cost: 5e21 },
  { id: 'touch_10', name: 'Already Offered', flavor: 'The gift precedes the giving.', cost: 5e26 },
];

/**
 * "Every source makes every Acolyte a little better." Cookie Clicker's
 * Thousand Fingers line, and the single most important balance idea in the
 * genre: it means a click build and an idle build feed each other instead of
 * competing.
 */
const CONGREGATION: { id: string; name: string; flavor: string; cost: number; add: number; needs: number }[] = [
  { id: 'cong_1', name: 'A Thousand Fingers', flavor: 'Each of them yours, technically.', cost: 100_000, add: 0.1, needs: 25 },
  { id: 'cong_2', name: 'A Million Fingers', flavor: 'Every hand in the temple moves when yours does.', cost: 1e7, add: 0.5, needs: 50 },
  { id: 'cong_3', name: 'A Billion Fingers', flavor: 'The gesture has become a weather system.', cost: 1e8, add: 5, needs: 100 },
  { id: 'cong_4', name: 'A Trillion Fingers', flavor: 'Counted once. Never again.', cost: 1e9, add: 50, needs: 150 },
  { id: 'cong_5', name: 'A Quadrillion Fingers', flavor: 'The congregation is now a texture.', cost: 1e11, add: 500, needs: 200 },
  { id: 'cong_6', name: 'A Quintillion Fingers', flavor: 'Applause with no discernible individuals in it.', cost: 1e14, add: 5_000, needs: 250 },
  { id: 'cong_7', name: 'A Sextillion Fingers', flavor: 'Somewhere in there, the original hand.', cost: 1e17, add: 50_000, needs: 300 },
  { id: 'cong_8', name: 'A Septillion Fingers', flavor: 'Reaching is what the universe does now.', cost: 1e20, add: 500_000, needs: 350 },
  { id: 'cong_9', name: 'An Octillion Fingers', flavor: 'You have not moved in some time. It continues.', cost: 1e23, add: 5e6, needs: 400 },
  { id: 'cong_10', name: 'A Nonillion Fingers', flavor: 'The gesture outlived the hand and did not notice.', cost: 1e26, add: 5e7, needs: 450 },
];

/**
 * The offering scales with your rate. Small percentages, but they compound
 * with everything else, which is exactly what makes a click frenzy worth
 * catching in the deep game.
 */
const FERVOUR_MATERIALS = [
  ['Wax', 5e4, 'It takes a fingerprint and keeps it.'],
  ['Silver', 5e6, 'Cold at first. Then exactly your temperature.'],
  ['Ivory', 5e8, 'Warm the moment you touch it. Nobody can explain this.'],
  ['Amber', 5e10, 'Something small and glad is suspended inside.'],
  ['Alabaster', 5e12, 'Lit from within by whatever you brought.'],
  ['Chrysoprase', 5e14, 'Green as the first morning of anything.'],
  ['Moonstone', 5e16, 'Holds one night and gives it back on request.'],
  ['Sunstone', 5e18, 'Holds one noon. Considerably harder to put down.'],
  ['Adamant', 5e20, 'Nothing marks it. Your hand marks it.'],
  ['Empyrean Glass', 5e22, 'You can see the other side, and it is also here.'],
] as const;

function touchBlessings(): BlessingDef[] {
  const out: BlessingDef[] = [];

  TOUCH_DOUBLINGS.forEach((u, i) => {
    out.push({
      id: u.id,
      name: u.name,
      flavor: u.flavor,
      icon: '🤲',
      kind: 'touch',
      cost: u.cost,
      touchMultiplier: 2,
      unlock: {
        touches: [10, 50, 200, 1_000, 3_000, 8_000, 20_000, 50_000, 100_000, 200_000][i]!,
        ...(i > 0 ? { requires: TOUCH_DOUBLINGS[i - 1]!.id } : {}),
      },
    });
  });

  CONGREGATION.forEach((u, i) => {
    out.push({
      id: u.id,
      name: u.name,
      flavor: u.flavor,
      icon: '👐',
      kind: 'touch',
      cost: u.cost,
      acolyteFromCongregation: u.add,
      unlock: {
        source: { id: 'acolyte', count: u.needs },
        ...(i > 0 ? { requires: CONGREGATION[i - 1]!.id } : {}),
      },
    });
  });

  FERVOUR_MATERIALS.forEach(([material, cost, flavor], i) => {
    out.push({
      id: `fervour_${i + 1}`,
      name: `${material} Censer`,
      flavor: flavor as string,
      icon: '🪔',
      kind: 'touch',
      cost: cost as number,
      // Each adds 1% of joy-per-second to every offering.
      touchShareOfJps: 0.01,
      unlock: {
        touches: 100 * Math.pow(2, i),
        ...(i > 0 ? { requires: `fervour_${i}` } : {}),
      },
    });
  });

  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
   Cherubim — the trophy multiplier
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Devotion is 4% per trophy. A Cherub multiplies *everything* by
 * `1 + Devotion × factor`, and they stack multiplicatively — so a full trophy
 * case turns a modest temple into an absurd one, and chasing trophies stops
 * being a side activity.
 */
const CHERUBIM: { name: string; epithet: string; cost: number; factor: number; trophies: number }[] = [
  { name: 'Cherub of Small Kindnesses', epithet: 'notices what you did', cost: 9e6, factor: 0.05, trophies: 5 },
  { name: 'Cherub of Good Mornings', epithet: 'wakes before you', cost: 9e9, factor: 0.1, trophies: 15 },
  { name: 'Cherub of Fair Weather', epithet: 'holds the umbrella', cost: 9e13, factor: 0.2, trophies: 30 },
  { name: 'Cherub of Second Chances', epithet: 'never mentions the first', cost: 9e16, factor: 0.2, trophies: 50 },
  { name: 'Cherub of Long Afternoons', epithet: 'stops the clock politely', cost: 9e20, factor: 0.2, trophies: 75 },
  { name: 'Cherub of Kept Promises', epithet: 'writes nothing down', cost: 9e23, factor: 0.2, trophies: 100 },
  { name: 'Cherub of Unearned Grace', epithet: 'insists you deserved it', cost: 9e26, factor: 0.2, trophies: 130 },
  { name: 'Cherub of Quiet Rooms', epithet: 'shuts the door softly', cost: 9e29, factor: 0.2, trophies: 160 },
  { name: 'Cherub of Warm Bread', epithet: 'always slightly early', cost: 9e35, factor: 0.175, trophies: 190 },
  { name: 'Cherub of Homecoming', epithet: 'left the light on', cost: 9e41, factor: 0.15, trophies: 220 },
  { name: 'Cherub of the Last Word', epithet: 'and it was kind', cost: 9e47, factor: 0.125, trophies: 250 },
  { name: 'Cherub of Everything Else', epithet: 'covers the remainder', cost: 9e53, factor: 0.115, trophies: 280 },
  { name: 'Seraph of Sufficiency', epithet: 'you may stop now', cost: 9e59, factor: 0.105, trophies: 310 },
  { name: 'Seraph of the Full Cup', epithet: 'it is already overflowing', cost: 9e65, factor: 0.095, trophies: 340 },
];

function cherubBlessings(): BlessingDef[] {
  return CHERUBIM.map((c, i) => ({
    id: `cherub_${i + 1}`,
    name: c.name,
    flavor: `It ${c.epithet}.`,
    icon: '👼',
    kind: 'cherub' as BlessingKind,
    cost: c.cost,
    devotionFactor: c.factor,
    unlock: { trophies: c.trophies, ...(i > 0 ? { requires: `cherub_${i}` } : {}) },
  }));
}

/* ══════════════════════════════════════════════════════════════════════════
   Relics — the steady drip of small global multipliers
   ══════════════════════════════════════════════════════════════════════════ */

const RELICS: [name: string, flavor: string, percent: number][] = [
  ['Splinter of the True Bench', 'He sat down. That was the whole miracle.', 1],
  ['Vial of the First Rain', 'It smells like the afternoon it fell.', 1],
  ['The Unfinished Psalm', 'Ends mid-line. Everyone finishes it differently.', 1],
  ['Cup With One Sip Left', 'There has always been one sip left.', 2],
  ['Ash of the Kind Fire', 'It only ever burned what needed burning.', 2],
  ['The Well-Worn Step', 'Hollowed by feet. Yours are in there somewhere.', 2],
  ['Feather, Unattributed', 'Too large. Wrong colour. Definitely a feather.', 3],
  ['The Patient Bell', 'Rung once a century. Still ringing.', 3],
  ['Thread From the Hem', 'You only had to get close.', 4],
  ['A Door With No Building', 'Standing in a field. Works perfectly.', 4],
  ['The Recovered Laugh', 'Someone laughed in 1204 and it was kept.', 5],
  ['Salt From the Kind Sea', 'It gave the ship back.', 5],
  ['The Second Sunrise', 'Same day. They ran it twice.', 6],
  ['Manuscript of the Good Ending', 'It was always in the archive.', 7],
  ['The Reconciled Ledger', 'Every debt in it reads: forgiven.', 8],
  ['Crown of Nobody in Particular', 'Fits everyone. Weighs nothing.', 9],
  ['The Original Yes', 'Said before there was anything to say it to.', 10],
  ['Fragment of the Sustained Note', 'Still audible if the room is quiet enough.', 12],
  ['The Kept Appointment', 'You forgot. It waited.', 15],
  ['Nothing, Beautifully Framed', 'The finest piece in the collection.', 20],
];

function relicBlessings(): BlessingDef[] {
  return RELICS.map((r, i) => ({
    id: `relic_${i + 1}`,
    name: r[0],
    flavor: r[1],
    icon: '⚱️',
    kind: 'rite' as BlessingKind,
    // Prices climb by ~×1000 per relic across the whole game's range.
    cost: 1e5 * Math.pow(180, i),
    globalMultiplier: 1 + r[2] / 100,
    unlock: {
      lifetimeJoy: 1e5 * Math.pow(180, i) * 2,
      ...(i > 0 ? { requires: `relic_${i}` } : {}),
    },
  }));
}

/* ══════════════════════════════════════════════════════════════════════════
   Synergies — a wide temple beats a tall one
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * `boosted` gains `factor` of its base output per copy of `from` you own. The
 * pairs are deliberately thematic — the grove feeds the chrismworks, the
 * scriptorium explains the apocrypha — so the mechanic teaches the fiction.
 */
const SYNERGY_PAIRS: [boosted: SourceId, from: SourceId, name: string, flavor: string][] = [
  ['devotee', 'grove', 'Harvest Suppers', 'Nobody kneels well on an empty stomach.'],
  ['grove', 'chrismworks', 'The Standing Order', 'The press never waits for the crop now.'],
  ['quarry', 'sanctuary', 'Commissioned Stone', 'Cut to a plan, for once.'],
  ['chrismworks', 'reliquary', 'Anointed Bones', 'Everything in the cabinet gleams.'],
  ['almshouse', 'devotee', 'The Collection Plate', 'It goes round twice and comes back heavier.'],
  ['sanctuary', 'seraphim', 'Resident Choir', 'They moved in. The acoustics improved.'],
  ['scriptorium', 'apocrypha', 'The Recovered Shelf', 'Forty scribes, suddenly very busy.'],
  ['pilgrimFleet', 'heavensGate', 'Gates at Every Port', 'The crossing takes no time at all.'],
  ['reliquary', 'quarry', 'Alabaster Caskets', 'They glow from the inside now.'],
  ['heavensGate', 'mandala', 'Doors Within Doors', 'Each one opens onto the next one opening.'],
  ['hourglass', 'fatebinder', 'Fortunate Timing', 'The sand falls when it suits you.'],
  ['raptureEngine', 'empyrean', 'Solar Intake', 'It runs on morning and never runs out.'],
  ['prism', 'quarry', 'Translucent Housing', 'The walls join in.'],
  ['fatebinder', 'hourglass', 'Retroactive Luck', 'It was always going to work.'],
  ['mandala', 'scriptorium', 'The Illuminated Pattern', 'Someone drew it and then it drew back.'],
  ['apocrypha', 'oversoul', 'Collective Reading', 'Everyone gets to the good part at once.'],
  ['paradise', 'grove', 'The Original Garden', 'It was always the same grove.'],
  ['oversoul', 'beloved', 'Everyone, Adored', 'It scales better than expected.'],
  ['beloved', 'paradise', 'A Place To Be Loved In', 'The setting turned out to matter.'],
  ['seraphim', 'prism', 'Song Made Visible', 'You can watch the chord now.'],
  ['empyrean', 'vision', 'Nothing In The Way', 'The last of the haze went.'],
  ['feast', 'almshouse', 'Everyone Invited', 'The guest list is simply everyone.'],
  ['vision', 'oversoul', 'Seen Together', 'Alone it would have been too much.'],
];

function synergyBlessings(): BlessingDef[] {
  return SYNERGY_PAIRS.map(([boosted, from, name, flavor]): BlessingDef => ({
    id: `synergy_${boosted}_${from}`,
    name,
    flavor,
    icon: '🔗',
    kind: 'synergy',
    cost: SOURCE_MAP[boosted].baseCost * 2000,
    synergy: { boosted, from, factor: 0.002 },
    unlock: {
      source: { id: boosted, count: 15 },
      // Gated on the partner too, so the pair has to actually exist.
      requires: `${from}_t2`,
    },
  }));
}

/* ══════════════════════════════════════════════════════════════════════════
   Halos — the golden-halo layer
   ══════════════════════════════════════════════════════════════════════════ */

const HALO_BLESSINGS: BlessingDef[] = [
  {
    id: 'halo_sight', name: 'Eyes Adjusted to Gold', flavor: 'You start noticing them in the corner of things.',
    icon: '🌟', kind: 'halo', cost: 77_777, haloFrequency: 1.25,
    unlock: { joy: 50_000 },
  },
  {
    id: 'halo_patience', name: 'The Lingering Light', flavor: 'It waits a little longer than it used to.',
    icon: '🌟', kind: 'halo', cost: 777_777, haloPatience: 1.5,
    unlock: { requires: 'halo_sight' },
  },
  {
    id: 'halo_potency', name: 'Deserved It', flavor: 'The blessing arrives with interest.',
    icon: '🌟', kind: 'halo', cost: 77_777_777, haloPotency: 1.5,
    unlock: { requires: 'halo_patience' },
  },
  {
    id: 'halo_frequency2', name: 'A Habit of Providence', flavor: 'It has started looking for you.',
    icon: '🌟', kind: 'halo', cost: 7.77e11, haloFrequency: 1.4,
    unlock: { requires: 'halo_potency' },
  },
  {
    id: 'halo_potency2', name: 'Overwhelming Favour', flavor: 'This is more than anyone asked for.',
    icon: '🌟', kind: 'halo', cost: 7.77e15, haloPotency: 2,
    unlock: { requires: 'halo_frequency2' },
  },
  {
    id: 'halo_patience2', name: 'It Will Wait All Day', flavor: 'There is no hurry. There was never a hurry.',
    icon: '🌟', kind: 'halo', cost: 7.77e19, haloPatience: 2,
    unlock: { requires: 'halo_potency2' },
  },
  {
    id: 'halo_frequency3', name: 'Providence, Constant', flavor: 'You have stopped calling it luck.',
    icon: '🌟', kind: 'halo', cost: 7.77e24, haloFrequency: 1.5,
    unlock: { requires: 'halo_patience2' },
  },
  {
    id: 'halo_potency3', name: 'The Unreasonable Gift', flavor: 'Nobody is keeping score anymore.',
    icon: '🌟', kind: 'halo', cost: 7.77e30, haloPotency: 3,
    unlock: { requires: 'halo_frequency3' },
  },
];

/* ══════════════════════════════════════════════════════════════════════════
   The Rapture — the chain that makes the game stranger and richer
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Buying into the Rapture is a real decision: Sinners latch onto the temple and
 * drink 5% of your rate each, but they hand back everything they drank ×1.15
 * when struck — and they keep drinking while the tab is shut. It is the
 * single best offline mechanic in the genre and it is *supposed* to look like
 * a mistake at first.
 */
const RAPTURE_BLESSINGS: BlessingDef[] = [
  {
    id: 'rapture_1', name: 'One Cracked Window', flavor: 'Something out there is very interested in how well this is going.',
    icon: '🌙', kind: 'rapture', cost: 1e9, raptureStage: 1,
    unlock: { source: { id: 'devotee', count: 40 }, lifetimeJoy: 1e9 },
  },
  {
    id: 'rapture_2', name: 'The Door Left Ajar', flavor: 'They are not hostile. They are extremely hungry.',
    icon: '🌘', kind: 'rapture', cost: 1e12, raptureStage: 2,
    unlock: { requires: 'rapture_1', rapture: 1 },
  },
  {
    id: 'rapture_3', name: 'Come In, Then', flavor: 'You held it open yourself. Everyone saw you do it.',
    icon: '🌑', kind: 'rapture', cost: 1e15, raptureStage: 3,
    unlock: { requires: 'rapture_2', rapture: 2 },
  },
  {
    id: 'rapture_calm', name: 'Close the Window', flavor: 'Enough. For now.',
    icon: '🌕', kind: 'rapture', cost: 1e10, raptureStage: 0,
    unlock: { requires: 'rapture_1', rapture: 1 },
  },
  {
    id: 'sinner_yield_1', name: 'The Tithe Returned', flavor: 'What they took was never really gone.',
    icon: '🫀', kind: 'rapture', cost: 1e13, sinnerYield: 1.2,
    unlock: { requires: 'rapture_1', rapture: 1 },
  },
  {
    id: 'sinner_yield_2', name: 'Interest on Absence', flavor: 'They have been holding it for you. Carefully.',
    icon: '🫀', kind: 'rapture', cost: 1e17, sinnerYield: 1.5,
    unlock: { requires: 'sinner_yield_1' },
  },
  {
    id: 'sinner_yield_3', name: 'Everything They Swallowed', flavor: 'All of it. Plus what it grew into.',
    icon: '🫀', kind: 'rapture', cost: 1e22, sinnerYield: 2,
    unlock: { requires: 'sinner_yield_2' },
  },
  {
    id: 'sinner_appetite', name: 'Insatiable Guests', flavor: 'They eat faster. They also fatten faster. Do the arithmetic.',
    icon: '🕳️', kind: 'rapture', cost: 1e19, sinnerAppetite: 2,
    unlock: { requires: 'sinner_yield_1', rapture: 2 },
  },
  {
    id: 'sable_halos', name: 'Halos of Sackcloth', flavor: 'The dark ones pay better. Obviously they do.',
    icon: '🌘', kind: 'rapture', cost: 1e16, haloPotency: 1.3,
    unlock: { requires: 'rapture_2', rapture: 2 },
  },
];

/* ══════════════════════════════════════════════════════════════════════════
   Rites — manna, the vigil, and the minigames
   ══════════════════════════════════════════════════════════════════════════ */

const RITE_BLESSINGS: BlessingDef[] = [
  {
    id: 'vigil_1', name: 'The Night Office', flavor: 'Somebody has to keep it lit while you sleep.',
    icon: '🕯️', kind: 'rite', cost: 1e7, vigilEfficiency: 0.15, vigilHours: 3,
    unlock: { lifetimeJoy: 1e7 },
  },
  {
    id: 'vigil_2', name: 'The Standing Watch', flavor: 'Three shifts. Nobody complains.',
    icon: '🕯️', kind: 'rite', cost: 1e11, vigilEfficiency: 0.15, vigilHours: 6,
    unlock: { requires: 'vigil_1' },
  },
  {
    id: 'vigil_3', name: 'The Unsleeping Temple', flavor: 'It has forgotten how to close.',
    icon: '🕯️', kind: 'rite', cost: 1e16, vigilEfficiency: 0.2, vigilHours: 12,
    unlock: { requires: 'vigil_2' },
  },
  {
    id: 'vigil_4', name: 'Time Does Not Apply Here', flavor: 'Come back whenever. Genuinely whenever.',
    icon: '🕯️', kind: 'rite', cost: 1e23, vigilEfficiency: 0.2, vigilHours: 24,
    unlock: { requires: 'vigil_3' },
  },
  {
    id: 'manna_1', name: 'Dew Before Dawn', flavor: 'It arrives overnight and nobody sees it land.',
    icon: '🍞', kind: 'rite', cost: 1e14, mannaSpeed: 1.1,
    unlock: { lifetimeJoy: 1e14 },
  },
  {
    id: 'manna_2', name: 'A Double Portion', flavor: 'Gathered on the sixth day, for the seventh.',
    icon: '🍞', kind: 'rite', cost: 1e18, mannaSpeed: 1.15,
    unlock: { requires: 'manna_1' },
  },
  {
    id: 'manna_3', name: 'The Full Omer', flavor: 'Measured out exactly, every time, by nobody.',
    icon: '🍞', kind: 'rite', cost: 1e24, mannaSpeed: 1.2,
    unlock: { requires: 'manna_2' },
  },
  {
    id: 'steward', name: 'The Steward', flavor: 'Handles the buying. Has never once bought badly.',
    icon: '🗝️', kind: 'rite', cost: 1e12, unlock: { lifetimeJoy: 1e12 },
  },
  {
    id: 'grace_gift_1', name: 'Prepared for the Journey', flavor: 'What you leave behind is not lost, exactly.',
    icon: '☁️', kind: 'grace', cost: 1e20, unlock: { ascensions: 1 },
  },
  {
    id: 'grace_gift_2', name: 'The Longer Reckoning', flavor: 'They counted again and found more.',
    icon: '☁️', kind: 'grace', cost: 1e28, unlock: { ascensions: 3, requires: 'grace_gift_1' },
  },
];

/* ══════════════════════════════════════════════════════════════════════════
   Assembly
   ══════════════════════════════════════════════════════════════════════════ */

export const BLESSINGS: BlessingDef[] = [
  ...tieredBlessings(),
  ...touchBlessings(),
  ...cherubBlessings(),
  ...relicBlessings(),
  ...synergyBlessings(),
  ...HALO_BLESSINGS,
  ...RAPTURE_BLESSINGS,
  ...RITE_BLESSINGS,
];

export const BLESSING_MAP: Record<string, BlessingDef> = Object.fromEntries(
  BLESSINGS.map((b) => [b.id, b]),
);

/** For the filter rail, in the order they should appear. */
export const BLESSING_KINDS: { id: BlessingKind | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'source', label: 'Sources' },
  { id: 'touch', label: 'Touch' },
  { id: 'cherub', label: 'Cherubim' },
  { id: 'synergy', label: 'Synergy' },
  { id: 'halo', label: 'Halos' },
  { id: 'rapture', label: 'Rapture' },
  { id: 'rite', label: 'Rites' },
  { id: 'grace', label: 'Grace' },
];

/** Blessings that only matter through their side effects, not a multiplier. */
export const STEWARD_BLESSING = 'steward';
