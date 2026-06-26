// ─── Generated World Contract ─────────────────────────────────────────────────
// The frozen data model for a procedurally generated VerseCraft "version".
// Everything here is deterministic from a seed. The portrait system and the
// story-generation engine both depend on these types, so treat them as a
// stable contract.

// ─── Emotions ────────────────────────────────────────────────────────────────
// The canonical emotion set every portrait can render. Dialogue lines are
// tagged with one of these so a character's face matches what they're feeling.
// Generators may emit looser words; map them through `normalizeEmotion`.

export const EMOTIONS = [
  'neutral',
  'happy',
  'joyful',
  'sad',
  'crying',
  'angry',
  'annoyed',
  'surprised',
  'afraid',
  'nervous',
  'blush',
  'smirk',
  'thoughtful',
  'confident',
  'tired',
  'hurt',
] as const;

export type Emotion = (typeof EMOTIONS)[number];

/** Map an arbitrary emotion-ish word onto the canonical set. */
export function normalizeEmotion(raw: string | undefined | null): Emotion {
  if (!raw) return 'neutral';
  const w = raw.toLowerCase().trim();
  if ((EMOTIONS as readonly string[]).includes(w)) return w as Emotion;
  const aliases: Record<string, Emotion> = {
    // happy family
    smile: 'happy', smiling: 'happy', glad: 'happy', warm: 'happy', tender: 'happy',
    content: 'happy', pleased: 'happy', gentle: 'happy', fond: 'happy',
    laugh: 'joyful', laughing: 'joyful', delighted: 'joyful', excited: 'joyful',
    ecstatic: 'joyful', elated: 'joyful', grin: 'joyful', beaming: 'joyful',
    // sad family
    melancholy: 'sad', down: 'sad', sorrow: 'sad', wistful: 'sad', dejected: 'sad',
    disappointed: 'sad', lonely: 'sad', grief: 'sad', somber: 'sad',
    weeping: 'crying', sobbing: 'crying', tearful: 'crying', devastated: 'crying',
    // anger family
    furious: 'angry', mad: 'angry', rage: 'angry', enraged: 'angry', livid: 'angry',
    irritated: 'annoyed', frustrated: 'annoyed', exasperated: 'annoyed',
    disapproving: 'annoyed', skeptical: 'annoyed', unimpressed: 'annoyed',
    // surprise family
    shocked: 'surprised', startled: 'surprised', astonished: 'surprised',
    amazed: 'surprised', stunned: 'surprised', awe: 'surprised', awestruck: 'surprised',
    // fear family
    scared: 'afraid', terrified: 'afraid', fearful: 'afraid', anxious: 'afraid',
    panicked: 'afraid', dread: 'afraid',
    worried: 'nervous', uneasy: 'nervous', timid: 'nervous', shy: 'nervous',
    embarrassed: 'blush', flustered: 'blush', bashful: 'blush', sheepish: 'blush',
    // sly family
    smug: 'smirk', sly: 'smirk', teasing: 'smirk', playful: 'smirk', mischievous: 'smirk',
    // thinking family
    pensive: 'thoughtful', contemplative: 'thoughtful', curious: 'thoughtful',
    considering: 'thoughtful', focused: 'thoughtful', distant: 'thoughtful',
    // confident family
    proud: 'confident', determined: 'confident', bold: 'confident', resolute: 'confident',
    fierce: 'confident', composed: 'confident',
    // tired family
    sleepy: 'tired', exhausted: 'tired', weary: 'tired', drained: 'tired', bored: 'tired',
    // hurt family
    pained: 'hurt', wounded: 'hurt', betrayed: 'hurt', heartbroken: 'hurt', vulnerable: 'hurt',
  };
  return aliases[w] ?? 'neutral';
}

// ─── Characters & World ──────────────────────────────────────────────────────

export type Pronouns = 'she/her' | 'he/him' | 'they/them';

/** Affinity/relationship axes a character tracks toward the MC. */
export interface GeneratedCharacter {
  id: string;            // stable slug, unique within the world
  name: string;          // display first name
  fullName: string;
  pronouns: Pronouns;
  age: number;
  role: string;          // their place in the story's world
  archetype: string;     // narrative archetype
  personality: string;   // 1–2 sentence voice/personality summary
  speechStyle: string;   // how they talk (used to keep dialogue in-voice)
  background: string;
  secret: string;        // the hidden thing that drives their arc
  fear: string;
  dream: string;
  relationToMC: string;  // how they first relate to the player
  /** Emotions this character leans toward — used to weight expression choice. */
  emotionalDefault: Emotion;
  /** Assigned curated sprite pack id (see lib/versecraft/sprites/registry). */
  packId: string;
  color: string;         // UI accent (derived from the pack)
  accentColor: string;
  romanceable: boolean;
}

/** A single emotional beat in the route plan. */
export interface StoryBeat {
  act: number;
  /** A short label for the beat ("first meeting", "the betrayal", "reconciliation"). */
  title: string;
  /** The emotional core the chapter should hit. */
  emotionalGoal: string;
  /** Characters who drive this beat. */
  focus: string[]; // character ids
}

export interface RoutePlan {
  /** Total chapters in this route — tuned so a full playthrough is ~6+ hours. */
  totalChapters: number;
  actCount: number;
  beats: StoryBeat[];
}

/** Backgrounds the renderer can actually display (existing asset keys). */
export const ENVIRONMENTS = [
  'school_hallway', 'club_room', 'classroom', 'school_stairs', 'school_gym',
  'park', 'cafe', 'personal_room', 'beach', 'city', 'forest',
] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

export interface MCProfile {
  /** The player-character. Usually a college student unless the prompt says otherwise. */
  name: string;
  pronouns: Pronouns;
  premise: string;     // who the MC is in this world
  situation: string;   // why they're here / the inciting setup
}

export interface GeneratedWorld {
  /** Schema version for migration safety. */
  schema: number;
  /** The shareable seed code this world was generated from. */
  seed: string;
  /** The raw MC prompt the player entered (or '' for random). */
  mcPrompt: string;
  /** Whether DeepSeek produced this world or the deterministic fallback did. */
  source: 'ai' | 'fallback';
  title: string;        // the route's title
  tagline: string;
  /** The central emotional premise of the whole route. */
  premise: string;
  /** The setting / world description. */
  setting: string;
  /** Tone descriptors ("bittersweet", "hopeful", "tense"). */
  toneTags: string[];
  /** Recurring imagery / motifs the writing should return to. */
  motifs: string[];
  /** Backgrounds this route draws scenes from. */
  environments: Environment[];
  mc: MCProfile;
  characters: GeneratedCharacter[];
  routePlan: RoutePlan;
  createdAt: number;
}

export const WORLD_SCHEMA_VERSION = 1;

// ─── Generated Chapter Content ────────────────────────────────────────────────
// What the per-chapter generator emits and the renderer consumes. Distinct from
// the legacy authored ChapterData in ../types.ts: dialogue is emotion-tagged and
// speakers are generated character ids.

export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

export type ChoiceTone = 'kind' | 'flirt' | 'guarded' | 'bold' | 'honest' | 'playful' | 'deep';

export interface GenChoice {
  text: string;
  tone: ChoiceTone;
  /** Affinity deltas keyed by character id. */
  affinity?: Record<string, number>;
  /** Story flags this choice sets. */
  flags?: Record<string, string | number | boolean>;
}

export interface GenNode {
  id: string;
  /** Character id, or null for narration. */
  speaker: string | null;
  text: string;
  emotion?: Emotion;
  choices?: GenChoice[];
}

export interface GenScene {
  id: string;
  environment: Environment;
  timeOfDay: TimeOfDay;
  /** Character ids physically present in the scene. */
  charactersPresent: string[];
  nodes: GenNode[];
}

export interface GenChapter {
  /** 0-based index within the route. */
  index: number;
  act: number;
  title: string;
  subtitle: string;
  /** The emotional core this chapter is built around. */
  emotionalGoal: string;
  scenes: GenScene[];
  source: 'ai' | 'fallback';
  /** True while more scenes are still streaming in for this chapter. */
  partial?: boolean;
}
