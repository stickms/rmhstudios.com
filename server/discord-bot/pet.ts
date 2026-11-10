/**
 * The pure domain model of the "Alex" tamagotchi (port of discordbot/pet.go): the pet state, its
 * stat decay, life stages, mood, and the care actions. No I/O — persistence is pet-repo.ts, the
 * Discord side pet-service.ts — so every game rule is unit-testable on its own.
 *
 * Instants are epoch milliseconds; a nullable timestamp is `number | null`.
 */

/** The single global Alex's primary key (the historical per-guild column, repurposed). */
export const GLOBAL_PET_KEY = 'global';

export type LifeStage = 'infant' | 'toddler' | 'child' | 'teen' | 'adult';

export const STAGE_ORDER: Record<LifeStage, number> = { infant: 0, toddler: 1, child: 2, teen: 3, adult: 4 };

/** Minimum age in hours per stage, oldest first. */
const STAGE_THRESHOLDS: Array<[LifeStage, number]> = [
  ['adult', 240],
  ['teen', 120],
  ['child', 48],
  ['toddler', 12],
  ['infant', 0],
];

export const STAGE_LABEL: Record<string, string> = {
  infant: 'Infant 👶',
  toddler: 'Toddler 🧒',
  child: 'Kid 🧑',
  teen: 'Teen 🧑‍🎓',
  adult: 'Adult 🧑‍💻',
};

/** Tunable pacing (env-overridable once at startup via configurePetRates). Tests rely on the defaults. */
export const rates = {
  growthScale: 1.0,
  hungerDecayPerHour: 8.0,
  happyDecayPerHour: 5.0,
  energyDecayPerHour: 6.0,
  hygieneDecayPerHour: 5.0,
  healthRegenPerHour: 4.0,
  healthDrainPerHour: 6.0,
};

/** Apply ALEX_* pacing overrides; unset, invalid or non-positive values keep the defaults. */
export function configurePetRates(env: Record<string, string | undefined> = process.env): void {
  const set = (key: string, field: keyof typeof rates) => {
    const v = env[key];
    if (v) {
      const f = Number(v);
      if (Number.isFinite(f) && f > 0 && v.trim() !== '') rates[field] = f;
    }
  };
  set('ALEX_GROWTH_SCALE', 'growthScale');
  set('ALEX_HUNGER_DECAY', 'hungerDecayPerHour');
  set('ALEX_HAPPY_DECAY', 'happyDecayPerHour');
  set('ALEX_ENERGY_DECAY', 'energyDecayPerHour');
  set('ALEX_HYGIENE_DECAY', 'hygieneDecayPerHour');
}

export const CRITICAL_THRESHOLD = 15.0;

const START = { hunger: 80, happiness: 80, energy: 90, hygiene: 90, health: 100 };

export interface PetState {
  guildId: string;
  name: string;
  generation: number;
  bornAt: number;
  hunger: number;
  happiness: number;
  energy: number;
  hygiene: number;
  health: number;
  intelligence: number;
  alive: boolean;
  lifeStage: LifeStage;
  career: string;
  statsUpdatedAt: number;
  lastInteractionAt: number;
  lastChannelId: string;
  lastFedAt: number | null;
  lastPlayedAt: number | null;
  lastCleanedAt: number | null;
  lastSleptAt: number | null;
  lastStudiedAt: number | null;
  lastChatAt: number | null;
  lastCareAlertAt: number | null;
  lastAmbientAt: number | null;
  diedAt: number | null;
  introSentAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export function newPet(guildId: string, now: number): PetState {
  return {
    guildId,
    name: 'Alex',
    generation: 1,
    bornAt: now,
    hunger: START.hunger,
    happiness: START.happiness,
    energy: START.energy,
    hygiene: START.hygiene,
    health: START.health,
    intelligence: 0,
    alive: true,
    lifeStage: 'infant',
    career: '',
    statsUpdatedAt: now,
    lastInteractionAt: now,
    lastChannelId: '',
    lastFedAt: null,
    lastPlayedAt: null,
    lastCleanedAt: null,
    lastSleptAt: null,
    lastStudiedAt: null,
    lastChatAt: null,
    lastCareAlertAt: null,
    lastAmbientAt: null,
    diedAt: null,
    introSentAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** New Game+ head start: 30% of the last life's intelligence, capped at 30. */
export function legacyIntelligenceBonus(prev: number): number {
  return Math.min(prev * 0.3, 30);
}

/**
 * Reincarnate as a gen-N+1 newborn, keeping the name, the channel and a legacy intelligence
 * bonus; the career is cleared so each life picks its own. Mutates in place.
 */
export function startNewLife(p: PetState, now: number): void {
  const gen = p.generation + 1;
  const { name, lastChannelId: channel } = p;
  const legacy = legacyIntelligenceBonus(p.intelligence);
  Object.assign(p, newPet(p.guildId, now));
  p.generation = gen;
  p.name = name;
  p.lastChannelId = channel;
  p.intelligence = legacy;
}

export function canGraduate(p: PetState): boolean {
  return p.alive && p.lifeStage === 'adult';
}

export function clampStat(v: number): number {
  return v < 0 ? 0 : v > 100 ? 100 : v;
}

export interface DecayResult {
  died: boolean;
  stageBefore: LifeStage;
  stageAfter: LifeStage;
  grewUp: boolean;
}

export const NO_DECAY: DecayResult = { died: false, stageBefore: 'infant', stageAfter: 'infant', grewUp: false };

const HOUR_MS = 3_600_000;

/**
 * Advance the stats to `now` by lazy integration over the hours since statsUpdatedAt: needs
 * drain, health drains per critical need (or regenerates while thriving), death at zero health,
 * then the stage is recomputed for a living pet. Mutates in place.
 */
export function applyDecay(p: PetState, now: number): DecayResult {
  const res: DecayResult = { died: false, stageBefore: p.lifeStage, stageAfter: p.lifeStage, grewUp: false };
  if (!p.statsUpdatedAt) p.statsUpdatedAt = now;
  const hours = (now - p.statsUpdatedAt) / HOUR_MS;

  if (p.alive && hours > 0) {
    p.hunger = clampStat(p.hunger - rates.hungerDecayPerHour * hours);
    p.happiness = clampStat(p.happiness - rates.happyDecayPerHour * hours);
    p.energy = clampStat(p.energy - rates.energyDecayPerHour * hours);
    p.hygiene = clampStat(p.hygiene - rates.hygieneDecayPerHour * hours);

    const critical = [p.hunger, p.happiness, p.energy, p.hygiene].filter((s) => s < CRITICAL_THRESHOLD).length;
    if (critical > 0) {
      p.health = clampStat(p.health - rates.healthDrainPerHour * critical * hours);
    } else if (p.hunger > 60 && p.happiness > 60 && p.energy > 40 && p.hygiene > 60) {
      p.health = clampStat(p.health + rates.healthRegenPerHour * hours);
    }
    if (p.health <= 0) {
      p.health = 0;
      p.alive = false;
      p.diedAt = now;
      res.died = true;
    }
  }
  if (hours > 0) p.statsUpdatedAt = now;

  if (p.alive) {
    const stage = computeStage(p, now);
    if (STAGE_ORDER[stage] > STAGE_ORDER[p.lifeStage]) res.grewUp = true;
    p.lifeStage = stage;
  }
  res.stageAfter = p.lifeStage;
  return res;
}

export function computeStage(p: PetState, now: number): LifeStage {
  const age = ((now - p.bornAt) / HOUR_MS) * rates.growthScale;
  for (const [stage, min] of STAGE_THRESHOLDS) if (age >= min) return stage;
  return 'infant';
}

/** "3d 4h" / "5h 12m" / "12m". */
export function ageString(p: PetState, now: number): string {
  const d = Math.max(0, now - p.bornAt);
  const totalHours = Math.trunc(d / HOUR_MS);
  const days = Math.trunc(totalHours / 24);
  const hours = totalHours % 24;
  const mins = Math.trunc(d / 60_000) % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export interface Mood {
  key: string;
  emoji: string;
  label: string;
}

/** Mood from stats, most urgent first. */
export function mood(p: PetState): Mood {
  if (!p.alive) return { key: 'gone', emoji: '💀', label: 'gone (needs a revive)' };
  if (p.health < 25) return { key: 'sick', emoji: '🤒', label: 'feelin real sick, need some care fr' };
  if (p.energy < 20) return { key: 'sleepy', emoji: '😴', label: 'lowkey exhausted, need a nap' };
  if (p.hunger < 20) return { key: 'hungry', emoji: '🍽️', label: 'starving no cap' };
  if (p.hygiene < 20) return { key: 'stinky', emoji: '🧼', label: 'kinda funky rn, need a wash' };
  if (p.happiness < 25) return { key: 'sad', emoji: '🥺', label: 'feelin down, could use some company' };
  if (p.hunger > 70 && p.happiness > 70 && p.energy > 60 && p.hygiene > 60) {
    return { key: 'thriving', emoji: '✨', label: 'thriving fr fr' };
  }
  return { key: 'chillin', emoji: '🧋', label: 'just vibin' };
}

/** Critical-need keys; ["gone"] when dead, [] when content. */
export function needs(p: PetState): string[] {
  if (!p.alive) return ['gone'];
  const out: string[] = [];
  if (p.health < 25) out.push('sick');
  if (p.hunger < CRITICAL_THRESHOLD) out.push('hungry');
  if (p.energy < CRITICAL_THRESHOLD) out.push('sleepy');
  if (p.hygiene < CRITICAL_THRESHOLD) out.push('stinky');
  if (p.happiness < CRITICAL_THRESHOLD) out.push('sad');
  return out;
}

export interface ActionResult {
  message: string;
  ok: boolean;
  /** Caretaker counter to increment ("feeds"/"plays"/...), "" when nothing applied. */
  care: string;
}

const dead = (): ActionResult => ({
  message: "Alex ain't with us rn 💀 — hit `/revive` to bring him back for a fresh start 🙏",
  ok: false,
  care: '',
});

export function feed(p: PetState, kind: string, now: number): ActionResult {
  if (!p.alive) return dead();
  const stuffed = p.hunger > 92;
  switch (kind) {
    case 'boba':
      p.hunger = clampStat(p.hunger + 25);
      p.happiness = clampStat(p.happiness + 15);
      break;
    case 'meal':
      p.hunger = clampStat(p.hunger + 45);
      p.happiness = clampStat(p.happiness + 5);
      break;
    case 'snack':
      p.hunger = clampStat(p.hunger + 18);
      p.happiness = clampStat(p.happiness + 8);
      break;
    default:
      return { message: 'idk what that is bro 😅', ok: false, care: '' };
  }
  p.lastFedAt = now;
  if (stuffed) return { message: pick(FEED_STUFFED_LINES), ok: true, care: 'feeds' };
  if (kind === 'boba') return { message: pick(FEED_BOBA_LINES), ok: true, care: 'feeds' };
  return { message: pick(FEED_FOOD_LINES), ok: true, care: 'feeds' };
}

export function play(p: PetState, now: number): ActionResult {
  if (!p.alive) return dead();
  if (p.energy < 15) return { message: 'Alex too gassed to play rn 😴 — let him `/rest` first', ok: false, care: '' };
  p.happiness = clampStat(p.happiness + 28);
  p.energy = clampStat(p.energy - 18);
  p.hunger = clampStat(p.hunger - 6);
  p.hygiene = clampStat(p.hygiene - 5);
  p.lastPlayedAt = now;
  return { message: pick(PLAY_LINES), ok: true, care: 'plays' };
}

export function clean(p: PetState, now: number): ActionResult {
  if (!p.alive) return dead();
  p.hygiene = 100;
  p.happiness = clampStat(p.happiness + 6);
  p.lastCleanedAt = now;
  return { message: pick(CLEAN_LINES), ok: true, care: 'cleans' };
}

export function rest(p: PetState, now: number): ActionResult {
  if (!p.alive) return dead();
  if (p.energy > 90) {
    return { message: "Alex ain't even tired rn 😎 — 'I'm locked in, no naps needed'", ok: false, care: '' };
  }
  p.energy = clampStat(p.energy + 65);
  p.happiness = clampStat(p.happiness + 5);
  p.health = clampStat(p.health + 5);
  p.lastSleptAt = now;
  return { message: pick(REST_LINES), ok: true, care: 'naps' };
}

/** Builds intelligence with diminishing returns (min 3 per session); refused when too tired. */
export function study(p: PetState, now: number): ActionResult {
  if (!p.alive) return dead();
  if (p.energy < 20) {
    return { message: 'Alex too fried to focus rn 🥴 — `/rest` him then hit the books', ok: false, care: '' };
  }
  const gain = Math.max(3, 10 * (1 - p.intelligence / 150));
  p.intelligence = clampStat(p.intelligence + gain);
  p.energy = clampStat(p.energy - 14);
  p.happiness = clampStat(p.happiness - 4);
  p.hunger = clampStat(p.hunger - 4);
  p.lastStudiedAt = now;
  return { message: pick(STUDY_LINES), ok: true, care: 'studies' };
}

export function intelligenceLabel(v: number): string {
  if (v >= 85) return 'genius 🧠✨';
  if (v >= 60) return 'sharp 📚';
  if (v >= 35) return 'learning 📖';
  if (v >= 15) return 'curious 🤔';
  return 'still figuring it out 😅';
}

// ─── Careers ──────────────────────────────────────────────────────────────

export const CAREER_LABEL: Record<string, string> = {
  swe: 'Software Engineer 👨‍💻',
  data: 'Data Scientist 📊',
  founder: 'Startup Founder 🚀',
  quant: 'Quant 📈',
  pm: 'Product Manager 📋',
  design: 'UX Designer 🎨',
};

export const CAREER_ORDER = ['swe', 'data', 'founder', 'quant', 'pm', 'design'];

export const CAREER_BLURB: Record<string, string> = {
  swe: '"we buildin fr, leetcode grind starts NOW 💻🔥"',
  data: '"pandas, numpy, and vibes — the data don\'t lie 📊"',
  founder: '"droppin outta the internship to raise a seed round, wish me luck 🚀"',
  quant: '"finna print money with math, it\'s giving hedge fund 📈"',
  pm: '"I don\'t code, I \'align stakeholders\' now 📋 lmaooo"',
  design: '"figma is my canvas, pixels are my paint 🎨"',
};

export function validCareer(key: string): boolean {
  return Object.hasOwn(CAREER_LABEL, key);
}

export function careerDisplay(key: string): string {
  if (Object.hasOwn(CAREER_LABEL, key)) return CAREER_LABEL[key]!;
  if (key !== '') return key;
  return 'undecided 🤷';
}

// ─── Flavor text ──────────────────────────────────────────────────────────

const FEED_BOBA_LINES = [
  'Alex slurped that boba down instantly 🧋 — "BROOO this is bussin fr fr, you the GOAT 🐐"',
  'boba secured 🧋 — "deadass needed this, you carried today no cap"',
  'Alex hit the boba like it owed him money 🧋 — "extra tapioca? it\'s giving luxury fr"',
  '"sheeeesh 50% sugar boba? you KNOW me" — Alex is thriving 🧋',
];
const FEED_FOOD_LINES = [
  'Alex demolished it 🍜 — "ok that HIT different, appreciate you fr"',
  'cleared the plate 🍱 — "lowkey needed the fuel, back to grinding"',
  '"that slaps ngl" — Alex is fed and happy 😋',
];
const FEED_STUFFED_LINES = [
  'Alex is deadass stuffed 😵‍💫 — "bro I can\'t, I\'m so full, save some for later"',
  '"ok ok I ate, chill lol" — Alex tapping out, he\'s stuffed 🍽️',
];
const PLAY_LINES = [
  'played some 2K with Alex 🎮 — "RUN IT BACK, I\'m cracked at this fr"',
  'Alex hit the griddy 🕺 — "caught that on camera? postin it fr"',
  'vibe-coded a lil app together 💻 — "we shipped it, no planning, pure vibes 🚀"',
  'showed Alex a meme 😭 — "NAHHH that\'s crazy, I\'m cryin bro"',
];
const CLEAN_LINES = [
  'scrubbed Alex up 🧼 — "squeaky clean, smellin like success fr"',
  'fresh fit, fresh vibes 🚿 — "ok I\'m lookin CRISP now, LinkedIn pic incoming"',
  'Alex all cleaned up ✨ — "hygiene is self care, remember that"',
];
const REST_LINES = [
  'tucked Alex in 😴 — "aight power nap then back to the grind, bet"',
  'Alex caught some Z\'s 💤 — "dreamt I got the return offer, manifesting fr"',
  'recharged 🔋 — "ok I\'m locked back in, let\'s cook"',
];
const STUDY_LINES = [
  'Alex locked in on some LeetCode 💻 — "two-pointer technique? say less, I\'m HIM 🧠"',
  'cracked open the textbook 📚 — "big O notation finally clickin, we up"',
  'Alex grinded a course on system design 🖥️ — "deadass gettin smarter by the second fr"',
  'study session complete 📖 — "brain gains > gym gains... ok maybe equal"',
  'Alex watched a 3-hour lecture at 2x speed 🎧 — "absorbed like 40% of that, W"',
];

/** A random element ("" for an empty list). */
export function pick(xs: readonly string[]): string {
  if (xs.length === 0) return '';
  return xs[Math.floor(Math.random() * xs.length)]!;
}

/** The bare stage noun for prose. */
export function stageWord(st: string): string {
  switch (st) {
    case 'infant':
      return 'infant';
    case 'toddler':
      return 'toddler';
    case 'child':
      return 'kid';
    case 'teen':
      return 'teenager';
    case 'adult':
      return 'grown adult';
    default:
      return 'lil guy';
  }
}

/** 1-32 printable runes, no @/#/backtick, newlines flattened. */
export function sanitizePetName(name: string): string {
  let s = name.trim().replace(/[@#`]/g, '').replace(/[\n\r]/g, ' ').trim();
  const r = [...s];
  if (r.length === 0) return '';
  s = r.slice(0, 32).join('');
  return s.trim();
}

/** Free text → a preset career key when it clearly names one (by key or alias), else "". */
export function normalizeCareer(input: string): string {
  const s = input.trim().toLowerCase();
  if (s === '') return '';
  if (Object.hasOwn(CAREER_LABEL, s)) return s;
  switch (s) {
    case 'software engineer':
    case 'software':
    case 'engineer':
    case 'swe':
    case 'dev':
    case 'developer':
    case 'programmer':
    case 'coder':
      return 'swe';
    case 'data scientist':
    case 'data science':
    case 'data':
    case 'ds':
    case 'ml':
    case 'machine learning':
    case 'ai':
      return 'data';
    case 'founder':
    case 'startup':
    case 'startup founder':
    case 'entrepreneur':
    case 'ceo':
      return 'founder';
    case 'quant':
    case 'quantitative':
    case 'quantitative analyst':
    case 'trader':
      return 'quant';
    case 'pm':
    case 'product manager':
    case 'product':
      return 'pm';
    case 'designer':
    case 'ux':
    case 'ux designer':
    case 'ui':
    case 'ui/ux':
    case 'design':
      return 'design';
  }
  return '';
}

/** A custom career: 1-40 runes, no mention/backtick/markdown characters. */
export function sanitizeCareer(input: string): string {
  let s = input.trim().replace(/[@#`*_]/g, '').replace(/[\n\r]/g, ' ').trim();
  const r = [...s];
  if (r.length === 0) return '';
  s = r.slice(0, 40).join('');
  return s.trim();
}

export function genericCareerBlurb(career: string): string {
  return `"aight bet, ${career} it is — we lockin in and grindin fr 🔒🔥"`;
}

/** 10-segment bar plus the number. */
export function statBar(v: number): string {
  const c = v < 0 ? 0 : v > 100 ? 100 : v;
  const filled = Math.min(10, Math.trunc((c + 5) / 10));
  return '█'.repeat(filled) + '░'.repeat(10 - filled) + ' ' + Math.trunc(c) + '/100';
}

export function legacyNote(intelligence: number): string {
  if (intelligence <= 0) return '🧠 Fresh start — no legacy knowledge to inherit yet.';
  return `🧠 Legacy bonus: born with **${Math.trunc(intelligence)}** intelligence from his past life's studies.`;
}

export function careerOptionsLine(): string {
  const parts = CAREER_ORDER.map((k) => '`' + k + '` ' + CAREER_LABEL[k]);
  return 'Options: ' + parts.join('  ·  ') + '\n…or just type **any** dream career you want — Alex will run with it 🎯';
}
