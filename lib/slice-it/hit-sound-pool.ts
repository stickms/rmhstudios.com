/**
 * Slice It — the hit-sound pool: what a player can pick, and what Shuffle picks.
 *
 * This list used to live inside `components/slice-it/SettingsPanel.tsx`, which
 * was fine while the drawer was the only thing that needed it. It is not any
 * more: the engine has to know which files to warm before the countdown ends,
 * and Shuffle has to draw from the same set the drawer offers. Two copies of a
 * filename list is how a picker ends up offering a sample that 404s, so there
 * is one copy and it is here.
 *
 * Client-safe and dependency-free on purpose — the engine, the settings drawer
 * and the asset test all import it.
 *
 * Ids are filenames. That is the existing contract: `store.hitSound` persists
 * the id, and the URL is the id appended to {@link HIT_SOUND_DIR}. Renaming a
 * file therefore silently resets that player's choice to the default, so don't.
 */

/** Where the samples live under `public/`. Paths still go through `asset()`. */
export const HIT_SOUND_DIR = '/music/slice-it/sounds/';

/** The engine's own synthesised click — no file, and the default for a reason. */
export const DEFAULT_HIT_SOUND_ID = 'default';

/** Draw a different sample for every note. See {@link pickHitSound}. */
export const RANDOM_HIT_SOUND_ID = 'random';

export interface HitSoundOption {
  /** Persisted in `store.hitSound`; for a sample this is its filename. */
  id: string;
  label: string;
  category: string;
  /** False for `default` and `random`, which resolve to something else. */
  isSample: boolean;
}

const sample = (id: string, label: string, category: string): HitSoundOption => ({
  id,
  label,
  category,
  isSample: true,
});

/**
 * Every option the settings drawer offers, in display order.
 *
 * The drawer groups by `category` in first-seen order, so the order here is the
 * order on screen. The first six categories are the original set and are left
 * where they were — a player who knows where "E-Snare B" sits should still find
 * it there.
 */
export const HIT_SOUND_OPTIONS: readonly HitSoundOption[] = [
  { id: DEFAULT_HIT_SOUND_ID, label: 'Default (Synth)', category: 'System', isSample: false },
  { id: RANDOM_HIT_SOUND_ID, label: 'Shuffle (All)', category: 'System', isSample: false },

  sample('drum-hitclap.wav', 'Hit Clap', 'Drums'),
  sample('drum-hitfinish.wav', 'Hit Finish', 'Drums'),
  sample('drum-hitwhistle.wav', 'Hit Whistle', 'Drums'),
  sample('soft-hitfinish.wav', 'Soft Finish', 'Drums'),
  sample('soft-hitwhistle.wav', 'Soft Whistle', 'Drums'),
  sample('all purpose clap.wav', 'All Purpose Clap', 'Drums'),

  sample('snare_a.wav', 'Snare A', 'Snares'),
  sample('snare_b.wav', 'Snare B', 'Snares'),
  sample('snare_c.wav', 'Snare C', 'Snares'),
  sample('snare_electronic_a.wav', 'E-Snare A', 'Snares'),
  sample('snare_electronic_b.wav', 'E-Snare B', 'Snares'),
  sample('snare_electronic_c.wav', 'E-Snare C', 'Snares'),

  sample('kick_a.wav', 'Kick A', 'Kicks'),
  sample('kick_b.wav', 'Kick B', 'Kicks'),
  sample('kick_c.wav', 'Kick C', 'Kicks'),
  sample('kick_electronic_a.wav', 'E-Kick A', 'Kicks'),
  sample('kick_electronic_b.wav', 'E-Kick B', 'Kicks'),
  sample('kick_electronic_c.wav', 'E-Kick C', 'Kicks'),

  sample('cymbal_a.wav', 'Cymbal A', 'Cymbals'),
  sample('cymbal_b.wav', 'Cymbal B', 'Cymbals'),
  sample('cymbal_c.wav', 'Cymbal C', 'Cymbals'),

  sample('tick.wav', 'Tick', 'Clock'),
  sample('tock.wav', 'Tock', 'Clock'),

  // ── Synthesised set (scripts/gen-slice-it-hit-sounds.ts) ─────────────────
  sample('click_sharp.wav', 'Sharp Click', 'Clicks'),
  sample('click_glass.wav', 'Glass Click', 'Clicks'),
  sample('synth_tick.wav', 'Synth Tick', 'Clicks'),

  sample('tap_crisp.wav', 'Crisp Tap', 'Taps'),
  sample('tap_rim.wav', 'Rim Tap', 'Taps'),
  sample('pop_soft.wav', 'Soft Pop', 'Taps'),
  sample('pop_bubble.wav', 'Bubble Pop', 'Taps'),

  sample('impact_snap.wav', 'Snap Impact', 'Impacts'),
  sample('impact_punch.wav', 'Punch Impact', 'Impacts'),
  sample('bass_thump.wav', 'Bass Thump', 'Impacts'),

  sample('glitch_bit.wav', 'Bit Glitch', 'Digital'),
  sample('glitch_zap.wav', 'Digital Zap', 'Digital'),
  sample('arcade_confirm.wav', 'Arcade Confirm', 'Digital'),

  sample('metal_ping.wav', 'Metal Ping', 'Metallic'),
  sample('metal_anvil.wav', 'Anvil', 'Metallic'),
];

/**
 * The Shuffle pool: every option backed by a file, in registration order.
 *
 * Unweighted, because the picker has never been weighted — one entry, one
 * chance. If weights are ever added they belong here, not at the call site.
 */
export const HIT_SOUND_SAMPLE_IDS: readonly string[] = HIT_SOUND_OPTIONS.filter(
  (option) => option.isSample,
).map((option) => option.id);

/** `public/`-relative path for a sample id. Still needs `asset()` for the CDN. */
export function hitSoundPath(id: string): string {
  return `${HIT_SOUND_DIR}${id}`;
}

/**
 * Pick the next sample, never the one that just played.
 *
 * Two identical hits in a row is the one outcome a shuffle must not produce:
 * it reads as the shuffle being broken, and on a dense chart it is the only
 * repetition the player can actually notice. Excluding one entry leaves the
 * rest uniform relative to each other, so nothing else about the distribution
 * changes.
 *
 * `random` is injected so the exclusion can be enumerated in a test rather than
 * sampled and hoped for.
 *
 * Degenerate pools are answers, not throws — an empty pool means "play the
 * synthesised default" and a pool of one means "play it again", because the
 * alternative is silence on every note.
 */
export function pickHitSound(
  pool: readonly string[],
  lastPlayed: string | null = null,
  random: () => number = Math.random,
): string | null {
  if (pool.length === 0) return null;
  if (pool.length === 1) return pool[0];

  const eligible = lastPlayed === null ? pool : pool.filter((id) => id !== lastPlayed);
  // A pool that is entirely `lastPlayed` (duplicate ids) leaves nothing
  // eligible; repeating beats returning null and dropping the sound.
  const candidates = eligible.length > 0 ? eligible : pool;

  const index = Math.min(candidates.length - 1, Math.floor(random() * candidates.length));
  return candidates[index];
}

/**
 * Every file a given setting might need decoded before the first note.
 *
 * Shuffle returns the whole pool — ~3 MB of WAV across 38 files, which sounds
 * like a lot until you notice the song itself is bigger, and that an
 * un-decoded sample falls back to the synthesised click for its first play.
 * A run that opens with a handful of wrong-sounding notes is the thing being
 * bought off here.
 */
export function hitSoundPreloadList(setting: string | null | undefined): readonly string[] {
  if (!setting || setting === DEFAULT_HIT_SOUND_ID) return [];
  if (setting === RANDOM_HIT_SOUND_ID) return HIT_SOUND_SAMPLE_IDS;
  return [setting];
}
