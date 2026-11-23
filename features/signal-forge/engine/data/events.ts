/**
 * Signal Forge events (v2): 39 encounters on the map's "?" nodes, each a choice between outcomes in the small
 * effect language of ../types.ts `EventOutcome`. Text is the English default for t(`event.<id>.*`).
 */
import type { EventDef } from '../types';

export const EVENTS: EventDef[] = [
  {
    id: 'data_cache', title: 'Data Cache', acts: [1, 2, 3],
    body: 'A sealed cache hums under a fallen girder.',
    choices: [
      { id: 'crack', label: 'Crack it open (gain 60 gold)', outcome: { gold: 60 } },
      { id: 'absorb', label: 'Absorb its charge (heal 25% HP)', outcome: { healPct: 0.25 } },
    ],
  },
  {
    id: 'repair_station', title: 'Repair Station', acts: [1, 2, 3],
    body: 'An old repair arm twitches awake as you pass.',
    choices: [
      { id: 'repair', label: 'Let it work (heal 30% HP)', outcome: { healPct: 0.3 } },
      { id: 'strip', label: 'Strip it for parts (gain 35 gold)', outcome: { gold: 35 } },
    ],
  },
  {
    id: 'purifier', title: 'Signal Purifier', acts: [1, 2, 3],
    body: 'A filter offers to strip noise from your deck.',
    choices: [
      { id: 'purify', label: 'Remove a card', outcome: { pick: 'remove' } },
      { id: 'sell', label: 'Sell the filter (gain 30 gold)', outcome: { gold: 30 } },
    ],
  },
  {
    id: 'quench_pool', title: 'Quench Pool', acts: [1, 2, 3],
    body: 'Oil-black water steams in a stone trough.',
    choices: [
      { id: 'temper', label: 'Temper a card', outcome: { pick: 'temper' } },
      { id: 'drink', label: 'Drink (heal 15% HP)', outcome: { healPct: 0.15 } },
    ],
  },
  {
    id: 'wandering_smith', title: 'Wandering Smith', acts: [1, 2],
    body: 'A smith with a cart of half-finished blades waves you over.',
    choices: [
      { id: 'buy', label: 'Buy a blade (pay 50 gold, gain an uncommon card)', costGold: 50, outcome: { card: 'random-uncommon' } },
      { id: 'help', label: 'Work the bellows (lose 6 HP, temper 2 random cards)', costHp: 6, outcome: { hp: -6, temperRandom: 2 } },
      { id: 'leave', label: 'Walk on', outcome: {} },
    ],
  },
  {
    id: 'live_wire', title: 'Live Wire', acts: [1, 2, 3],
    body: 'A cable spits sparks across the floor. Something glints underneath.',
    choices: [
      { id: 'grab', label: 'Grab it (lose 8 HP, gain a relic)', costHp: 8, outcome: { hp: -8, relic: 'random' } },
      { id: 'leave', label: 'Step around', outcome: {} },
    ],
  },
  {
    id: 'scrap_heap', title: 'Scrap Heap', acts: [1, 2, 3],
    body: 'Dig through it, and something might dig back.',
    choices: [
      { id: 'dig', label: 'Dig (gain 90 gold, or fight what lives here)', outcome: { gold: 90, risk: 0.35, alt: { fight: ['scrap_drone', 'ember_mite'] } } },
      { id: 'leave', label: 'Leave it', outcome: {} },
    ],
  },
  {
    id: 'mirror_coil', title: 'Mirror Coil', acts: [1, 2, 3],
    body: 'A coil that hums back whatever you sing into it.',
    choices: [
      { id: 'copy', label: 'Duplicate a card', outcome: { pick: 'duplicate' } },
      { id: 'leave', label: 'Keep walking', outcome: {} },
    ],
  },
  {
    id: 'transmuter', title: 'Transmuter', acts: [1, 2, 3],
    body: 'A crucible that melts one shape into another.',
    choices: [
      { id: 'melt', label: 'Transform a card', outcome: { pick: 'transform' } },
      { id: 'leave', label: 'Not today', outcome: {} },
    ],
  },
  {
    id: 'cursed_anvil', title: 'Cursed Anvil', acts: [1, 2, 3],
    body: 'Anything struck on it comes out stronger, and something else comes out with it.',
    choices: [
      { id: 'strike', label: 'Gain a rare card and a Rust curse', outcome: { card: 'random-rare', curse: 'rust' } },
      { id: 'leave', label: 'Leave it alone', outcome: {} },
    ],
  },
  {
    id: 'blood_furnace', title: 'Blood Furnace', acts: [2, 3],
    body: 'It takes warmth from you and gives back iron.',
    choices: [
      { id: 'feed', label: 'Feed it (lose 5 max HP, gain a rare card)', outcome: { maxHp: -5, card: 'random-rare' } },
      { id: 'leave', label: 'Back away', outcome: {} },
    ],
  },
  {
    id: 'cooling_vent', title: 'Cooling Vent', acts: [1, 2, 3],
    body: 'Cold air pours from a grate. Your hands stop shaking.',
    choices: [
      { id: 'rest', label: 'Rest here (heal 20% HP)', outcome: { healPct: 0.2 } },
      { id: 'tune', label: 'Recalibrate (gain 6 max HP)', outcome: { maxHp: 6 } },
    ],
  },
  {
    id: 'oscillator_shrine', title: 'Oscillator Shrine', acts: [1, 2, 3],
    body: 'Four tuning forks ring at four pitches. One is yours.',
    choices: [
      { id: 'pulse', label: 'Strike the Pulse fork (gain an uncommon card)', outcome: { card: 'random-uncommon' } },
      { id: 'pay', label: 'Leave an offering (pay 40 gold, gain a relic)', costGold: 40, outcome: { relic: 'random' } },
    ],
  },
  {
    id: 'glitch_bloom', title: 'Glitch Bloom', acts: [1, 2, 3],
    body: 'Corrupted code has grown into a flower of static.',
    choices: [
      { id: 'pick', label: 'Pick it (gain 75 gold and a Glitch)', outcome: { gold: 75, curse: 'glitch' } },
      { id: 'burn', label: 'Burn it (lose 4 HP)', costHp: 4, outcome: { hp: -4 } },
    ],
  },
  {
    id: 'old_conductor', title: 'The Old Conductor', acts: [1, 2, 3],
    body: 'A tin automaton taps a baton against a rail. It wants to hear you play.',
    choices: [
      { id: 'play', label: 'Play for it (temper a card)', outcome: { pick: 'temper' } },
      { id: 'listen', label: 'Listen instead (heal 10% HP, gain 20 gold)', outcome: { healPct: 0.1, gold: 20 } },
    ],
  },
  {
    id: 'cracked_capacitor', title: 'Cracked Capacitor', acts: [1, 2, 3],
    body: 'Still charged. Probably.',
    choices: [
      { id: 'drain', label: 'Drain it (gain a relic, or lose 12 HP)', outcome: { relic: 'random', risk: 0.4, alt: { hp: -12 } } },
      { id: 'leave', label: 'Leave it', outcome: {} },
    ],
  },
  {
    id: 'rusty_locker', title: 'Rusty Locker', acts: [1],
    body: 'A worker\'s locker, stuck shut for decades.',
    choices: [
      { id: 'force', label: 'Force it (lose 4 HP, gain Rusty Key)', costHp: 4, outcome: { hp: -4, relic: 'rusty_key' } },
      { id: 'leave', label: 'Leave it shut', outcome: {} },
    ],
  },
  {
    id: 'bell_tower', title: 'Bell Tower', acts: [2, 3],
    body: 'A bell with a crack running up its lip. It still rings.',
    choices: [
      { id: 'take', label: 'Take it (gain Cracked Bell, lose 8 max HP)', outcome: { relic: 'cracked_bell', maxHp: -8 } },
      { id: 'ring', label: 'Ring it (heal 15% HP)', outcome: { healPct: 0.15 } },
    ],
  },
  {
    id: 'rivet_tin', title: 'Rivet Tin', acts: [1, 2, 3],
    body: 'A tin of brass rivets, one shinier than the rest.',
    choices: [
      { id: 'take', label: 'Take the shiny one (gain Lucky Rivet, gain a Slag)', outcome: { relic: 'lucky_rivet', curse: 'slag' } },
      { id: 'sell', label: 'Sell the tin (gain 40 gold)', outcome: { gold: 40 } },
    ],
  },
  {
    id: 'phase_door', title: 'Phase Door', acts: [2, 3],
    body: 'A door that is only there on the beat.',
    choices: [
      { id: 'step', label: 'Step through (temper 2 random cards)', outcome: { temperRandom: 2 } },
      { id: 'wait', label: 'Wait for the off-beat (gain 50 gold)', outcome: { gold: 50 } },
    ],
  },
  {
    id: 'molten_river', title: 'Molten River', acts: [1, 2, 3],
    body: 'The only bridge is half melted.',
    choices: [
      { id: 'run', label: 'Run across (lose 10 HP)', costHp: 10, outcome: { hp: -10, gold: 30 } },
      { id: 'around', label: 'Go the long way (lose 15 gold)', costGold: 15, outcome: {} },
    ],
  },
  {
    id: 'ghost_signal', title: 'Ghost Signal', acts: [2, 3],
    body: 'A phrase repeats on an empty channel. It sounds like your own playing.',
    choices: [
      { id: 'answer', label: 'Answer it (gain a rare card, or fight a Coil Wraith)', outcome: { card: 'random-rare', risk: 0.4, alt: { fight: ['coil_wraith'] } } },
      { id: 'tune_out', label: 'Tune it out', outcome: {} },
    ],
  },
  {
    id: 'apprentice', title: 'The Apprentice', acts: [1, 2],
    body: 'A young smith offers to carry one of your cards for you.',
    choices: [
      { id: 'give', label: 'Hand one over (remove a card, gain 25 gold)', outcome: { pick: 'remove', gold: 25 } },
      { id: 'teach', label: 'Teach them (gain a common card)', outcome: { card: 'random-common' } },
    ],
  },
  {
    id: 'slag_golem', title: 'Sleeping Golem', acts: [1, 2],
    body: 'A slag golem sleeps on a heap of coins.',
    choices: [
      { id: 'steal', label: 'Steal (gain 100 gold, or wake it)', outcome: { gold: 100, risk: 0.5, alt: { fight: ['rivet_press', 'scrap_drone'] } } },
      { id: 'leave', label: 'Tiptoe past', outcome: {} },
    ],
  },
  {
    id: 'echo_chamber', title: 'Echo Chamber', acts: [2, 3],
    body: 'Every sound here comes back twice.',
    choices: [
      { id: 'shout', label: 'Shout (duplicate a card, lose 6 HP)', costHp: 6, outcome: { pick: 'duplicate', hp: -6 } },
      { id: 'whisper', label: 'Whisper (heal 10% HP)', outcome: { healPct: 0.1 } },
    ],
  },
  {
    id: 'furnace_vow', title: 'Furnace Vow', acts: [1, 2, 3],
    body: 'An inscription: give the fire something, and it gives back.',
    choices: [
      { id: 'vow', label: 'Make the vow (pay 40 gold, gain a relic)', costGold: 40, outcome: { relic: 'random' } },
      { id: 'refuse', label: 'Refuse', outcome: {} },
    ],
  },
  {
    id: 'overheated_core', title: 'Overheated Core', acts: [2, 3],
    body: 'A reactor core glows past white. Venting it would take a while.',
    choices: [
      { id: 'vent', label: 'Vent it (lose 7 HP, gain 8 max HP)', costHp: 7, outcome: { hp: -7, maxHp: 8 } },
      { id: 'leave', label: 'Leave before it blows', outcome: {} },
    ],
  },
  {
    id: 'circuit_maze', title: 'Circuit Maze', acts: [1, 2, 3],
    body: 'A printed maze on a board. The exit is etched with a prize.',
    choices: [
      { id: 'solve', label: 'Solve it (gain an uncommon card and 20 gold)', outcome: { card: 'random-uncommon', gold: 20 } },
      { id: 'skip', label: 'Skip it (heal 8% HP)', outcome: { healPct: 0.08 } },
    ],
  },
  {
    id: 'static_storm', title: 'Static Storm', acts: [2, 3],
    body: 'The air crackles. Your cards stick together.',
    choices: [
      { id: 'endure', label: 'Endure (gain a Glitch, temper a card)', outcome: { curse: 'glitch', pick: 'temper' } },
      { id: 'shelter', label: 'Shelter (lose 8 HP)', costHp: 8, outcome: { hp: -8 } },
    ],
  },
  {
    id: 'pawn_terminal', title: 'Pawn Terminal', acts: [1, 2, 3],
    body: 'A terminal buys cards at a fair price, it says.',
    choices: [
      { id: 'sell', label: 'Sell a card (remove a card, gain 45 gold)', outcome: { pick: 'remove', gold: 45 } },
      { id: 'leave', label: 'Leave', outcome: {} },
    ],
  },
  {
    id: 'smelter', title: 'The Smelter', acts: [2, 3],
    body: 'It melts two lesser things into one better one.',
    choices: [
      { id: 'smelt', label: 'Transform a card, then temper a random card', outcome: { pick: 'transform', temperRandom: 1 } },
      { id: 'leave', label: 'Leave', outcome: {} },
    ],
  },
  {
    id: 'lost_drone', title: 'Lost Drone', acts: [1, 2],
    body: 'A small drone is stuck in a pipe, beeping.',
    choices: [
      { id: 'free', label: 'Free it (lose 3 HP, gain a relic)', costHp: 3, outcome: { hp: -3, relic: 'random', risk: 0.5, alt: { hp: -3, gold: 25 } } },
      { id: 'leave', label: 'Leave it', outcome: {} },
    ],
  },
  {
    id: 'harmonic_well', title: 'Harmonic Well', acts: [3],
    body: 'At the bottom of the well, the forge\'s heartbeat is loud.',
    choices: [
      { id: 'listen', label: 'Listen (gain 10 max HP)', outcome: { maxHp: 10 } },
      { id: 'dive', label: 'Dive in (gain a rare card, lose 12 HP)', costHp: 12, outcome: { card: 'random-rare', hp: -12 } },
    ],
  },
  {
    id: 'vending_unit', title: 'Vending Unit', acts: [1, 2, 3],
    body: 'One button still lights up.',
    choices: [
      { id: 'press', label: 'Pay 30 gold (heal 30% HP)', costGold: 30, outcome: { healPct: 0.3 } },
      { id: 'kick', label: 'Kick it (gain 20 gold, or lose 5 HP)', outcome: { gold: 20, risk: 0.5, alt: { hp: -5 } } },
    ],
  },
  {
    id: 'spool_room', title: 'Spool Room', acts: [1, 2, 3],
    body: 'Spools of wire in every gauge, labelled in a hand you almost recognise.',
    choices: [
      { id: 'wind', label: 'Wind a new card (gain a common card, temper a random card)', outcome: { card: 'random-common', temperRandom: 1 } },
      { id: 'leave', label: 'Leave', outcome: {} },
    ],
  },
  {
    id: 'broken_choir', title: 'Broken Choir', acts: [2, 3],
    body: 'Iron singers lie in pieces. One still hums.',
    choices: [
      { id: 'mend', label: 'Mend it (pay 60 gold, gain a rare card)', costGold: 60, outcome: { card: 'random-rare' } },
      { id: 'salvage', label: 'Salvage (gain 45 gold)', outcome: { gold: 45 } },
    ],
  },
  {
    id: 'forge_spirit', title: 'Forge Spirit', acts: [3],
    body: 'A figure of embers bows and offers a gift for the road ahead.',
    choices: [
      { id: 'gift', label: 'Accept (gain a relic)', outcome: { relic: 'random' } },
      { id: 'blessing', label: 'Ask for a blessing (heal 40% HP)', outcome: { healPct: 0.4 } },
    ],
  },
  {
    id: 'tuning_room', title: 'Tuning Room', acts: [1, 2, 3],
    body: 'A quiet room of strings and forks. Everything here is in tune.',
    choices: [
      { id: 'tune', label: 'Temper a card', outcome: { pick: 'temper' } },
      { id: 'remove', label: 'Remove a card (lose 5 HP)', costHp: 5, outcome: { pick: 'remove', hp: -5 } },
    ],
  },
  {
    id: 'ember_market', title: 'Ember Market', acts: [2, 3],
    body: 'Traders around a fire, each selling one thing.',
    choices: [
      { id: 'card', label: 'Buy a card (pay 40 gold, gain an uncommon card)', costGold: 40, outcome: { card: 'random-uncommon' } },
      { id: 'relic', label: 'Buy a trinket (pay 110 gold, gain a relic)', costGold: 110, outcome: { relic: 'random' } },
      { id: 'leave', label: 'Browse and leave', outcome: {} },
    ],
  },
];

/** Lookup by id: a plain object built once (no cache, no expiry). */
const BY_ID: Readonly<Record<string, EventDef>> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));
export function eventDef(id: string): EventDef {
  const d = Object.hasOwn(BY_ID, id) ? BY_ID[id] : undefined;
  if (!d) throw new Error(`Unknown event: ${id}`);
  return d;
}
