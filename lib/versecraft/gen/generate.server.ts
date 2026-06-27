/**
 * VerseCraft AI generation (server-only). Uses the shared DeepSeek key to turn a
 * deterministic world shell into a richly personalized story. The shell (from
 * fallback.ts) owns everything that must stay valid — character ids, assigned
 * sprite packs, pronouns, route structure — and DeepSeek only fills in prose,
 * emotion, and choices. Any failure falls back to the deterministic generator,
 * so generation can never hard-fail. Determinism for a seed is preserved: the
 * shell is seeded, and AI output is cached per (seed, chapter) by the caller.
 */

import OpenAI from 'openai';
import { z } from 'zod';
import { fallbackWorld, fallbackChapter } from './fallback';
import { renderBible } from './bible';
import {
  CRAFT_SYSTEM, craftDirectives,
  VN_FORMAT, PROSE_CRAFT, SETTING_CRAFT, CHOICE_CRAFT, ANTI_REPETITION,
} from './craft';
import { dropDuplicateNodes } from './dedupe';
import { renderLedger, fallbackLedgerEntry } from './ledger';
import { buildDetailedOutline } from './outline';
import {
  EMOTIONS, ENVIRONMENTS, normalizeEmotion, WORLD_SCHEMA_VERSION, MC_SPEAKER,
  type GeneratedWorld, type GenChapter, type GenNode, type GenScene,
  type Pronouns, type Environment, type TimeOfDay, type ChoiceTone, type Attraction,
  type ArcOutline, type ChapterBeat, type LedgerEntry,
} from './world-types';

/** Speaker tokens that mean "the player is talking aloud". */
const MC_TOKENS = new Set(['mc', 'you', 'player', '{mc}', MC_SPEAKER]);

/** How the AI should make a character's NAME read, so name ↔ sprite ↔ pronouns
 *  never mismatch. Their sprite pack is already locked to the presentation. */
function nameGenderFor(p: Pronouns): string {
  if (p === 'she/her') return 'clearly feminine';
  if (p === 'he/him') return 'clearly masculine';
  return 'unisex / androgynous';
}

/** A short instruction describing who the player can fall for, so romance lands
 *  on fitting characters (or stays platonic) without baking the player's gender
 *  into the shared world. */
function attractionNote(a: Attraction | undefined): string {
  switch (a) {
    case 'men': return 'The player is romantically/sexually drawn to men; let romantic tension build with masculine (he/him) characters, and keep others warm but platonic.';
    case 'women': return 'The player is romantically/sexually drawn to women; let romantic tension build with feminine (she/her) characters, and keep others warm but platonic.';
    case 'none': return 'The player is not looking for romance; keep every bond deep and platonic — found-family, mentorship, fierce friendship — never romantic.';
    case 'everyone': default: return 'The player is open to romance with anyone; let chemistry follow the writing, regardless of gender.';
  }
}

const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || 'missing',
  baseURL: 'https://api.deepseek.com/v1',
  maxRetries: 1,
});
const MODEL = process.env.VERSECRAFT_AI_MODEL || process.env.RMHARK_AI_MODEL || 'deepseek-chat';

export function isVersecraftAIConfigured(): boolean {
  return Boolean(process.env.DEEPSEEK_API_KEY);
}

async function chatJson(system: string, user: string, maxTokens: number): Promise<unknown> {
  const res = await deepseek.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    max_tokens: maxTokens,
    temperature: 0.9,
    response_format: { type: 'json_object' },
    stream: false,
  });
  const raw = res.choices[0]?.message?.content?.trim() ?? '';
  return JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ''));
}

// ─── World enrichment ─────────────────────────────────────────────────────────

const WorldEnrich = z.object({
  title: z.string(),
  tagline: z.string(),
  premise: z.string(),
  setting: z.string(),
  motifs: z.array(z.string()).default([]),
  mcSituation: z.string().default(''),
  characters: z.array(z.object({
    name: z.string(),
    fullName: z.string().optional(),
    role: z.string(),
    personality: z.string(),
    speechStyle: z.string(),
    background: z.string(),
    secret: z.string(),
    fear: z.string(),
    dream: z.string(),
    relationToMC: z.string(),
  })),
});

export async function generateWorld(
  seed: string, mcPrompt: string, playerName = 'You', playerPronouns: Pronouns = 'they/them',
  attraction: Attraction = 'everyone',
): Promise<GeneratedWorld> {
  const shell = fallbackWorld(seed, mcPrompt, playerName, playerPronouns);
  shell.mc.attraction = attraction;
  if (!isVersecraftAIConfigured()) return shell;

  try {
    const castSpec = shell.characters.map((c, i) =>
      `#${i}: ${nameGenderFor(c.pronouns)} name, pronouns=${c.pronouns}, archetype="${c.archetype}", role="${c.role}", age=${c.age}`
    ).join('\n');
    const system =
      'You are the lead writer for VerseCraft, an emotional, character-driven anime visual novel for ADULT players. ' +
      'You design a unique cast and world for ONE playthrough. The drama must be propelled by what the CHARACTERS ' +
      'want and do, not by contrived external plot. Avoid clichés, melodrama, and stock anime tropes; aim for ' +
      'specific, aching, lived-in human detail — give each person contradictions, texture, a way of speaking that ' +
      'is theirs alone. Make the cast genuinely DIFFERENT from each other in voice, wound, and want. Mature, dark, ' +
      'and disturbing themes are welcome where they serve the story (grief, mortality, mental illness, self-harm ' +
      'ideation, estrangement, addiction, the aftermath of abuse, identity, desire) — written with honesty, weight, ' +
      'and care, never gratuitously or as shock value. ' +
      SETTING_CRAFT + '\n' + PROSE_CRAFT + '\n' +
      'Respond ONLY with a JSON object.';
    const user =
      `The PLAYER is the protagonist, written in second person ("you"). Their setup prompt: ` +
      `"${mcPrompt || '(none — surprise me; default to a college student adrift, looking for somewhere that feels like theirs)'}".\n` +
      `${attractionNote(attraction)}\n` +
      `IMPORTANT: never assume the player's gender. When a character says the player's name, write the literal token {mc}. ` +
      `If you must use a player pronoun, use the tokens {they}/{them}/{their}. Do not invent a name for the player.\n\n` +
      `Design the world and a cast of EXACTLY ${shell.characters.length} characters. For each, KEEP the given index, ` +
      `pronouns, role, and archetype, and give them a first name that matches the required name-gender (so name, ` +
      `pronouns, and on-screen sprite all agree):\n${castSpec}\n\n` +
      `Write a "premise" (2–3 sentences, address the player with {mc}) and a vivid "setting" (the place and its mood). ` +
      `Give 3 recurring "motifs" (concrete images the writing returns to). "mcSituation" is the specific reason the ` +
      `player has arrived and why it changes things.\n` +
      `For each character: "personality" (1–2 sentences of voice + contradiction), "speechStyle" (how they talk, ` +
      `concretely), "background", "secret" (the hidden thing driving their arc), "fear" and "dream" (deeply personal, ` +
      `specific), "relationToMC" (how they first regard the player — make these DIFFERENT across the cast).\n` +
      `Return JSON: {"title","tagline","premise","setting","motifs":[3 strings],"mcSituation",` +
      `"characters":[{"name","fullName","role","personality","speechStyle","background","secret","fear","dream","relationToMC"}]}. ` +
      `The cast array MUST be length ${shell.characters.length}, in the same index order.`;

    const parsed = WorldEnrich.parse(await chatJson(system, user, 2600));
    const characters = shell.characters.map((c, i) => {
      const e = parsed.characters[i];
      if (!e) return c;
      return {
        ...c,
        name: e.name || c.name,
        fullName: e.fullName || `${e.name} ${c.fullName.split(' ').slice(1).join(' ')}`,
        role: e.role || c.role,
        personality: e.personality || c.personality,
        speechStyle: e.speechStyle || c.speechStyle,
        background: e.background || c.background,
        secret: e.secret || c.secret,
        fear: e.fear || c.fear,
        dream: e.dream || c.dream,
        relationToMC: e.relationToMC || c.relationToMC,
      };
    });
    return {
      ...shell,
      source: 'ai',
      schema: WORLD_SCHEMA_VERSION,
      title: parsed.title || shell.title,
      tagline: parsed.tagline || shell.tagline,
      premise: parsed.premise || shell.premise,
      setting: parsed.setting || shell.setting,
      motifs: parsed.motifs.length ? parsed.motifs.slice(0, 4) : shell.motifs,
      mc: { ...shell.mc, attraction, situation: parsed.mcSituation || shell.mc.situation },
      characters,
    };
  } catch (err) {
    console.error('generateWorld AI failed, using fallback:', err);
    return shell;
  }
}

// ─── Chapter generation ───────────────────────────────────────────────────────

const ChapterSchema = z.object({
  title: z.string().optional(),
  subtitle: z.string().optional(),
  scenes: z.array(z.object({
    environment: z.string(),
    timeOfDay: z.string().optional(),
    charactersPresent: z.array(z.string()).default([]),
    nodes: z.array(z.object({
      speaker: z.string().nullable().optional(),
      text: z.string(),
      emotion: z.string().optional(),
      choices: z.array(z.object({
        text: z.string(),
        tone: z.string().optional(),
        direction: z.string().optional(),
        affinity: z.record(z.string(), z.number()).optional(),
      })).optional(),
    })),
  })),
});

const TONES: ChoiceTone[] = ['kind', 'flirt', 'guarded', 'bold', 'honest', 'playful', 'deep'];
const TIMES: TimeOfDay[] = ['morning', 'afternoon', 'evening', 'night'];

type RawScene = z.infer<typeof ChapterSchema>['scenes'][number];

function beatFor(world: GeneratedWorld, index: number) {
  const beats = world.routePlan.beats;
  return beats[Math.min(beats.length - 1, Math.floor((index / Math.max(1, world.routePlan.totalChapters)) * beats.length))];
}

function chapterSystemPrompt(): string {
  return (
    'You are the lead writer of VerseCraft, an emotional, character-driven anime visual novel in the vein of the ' +
    'best romance/drama VNs. The drama must come from the CHARACTERS\' own choices, desires, and wounds — never from ' +
    'contrived external events. Show feelings through action, subtext, and specific sensory detail; avoid melodrama, ' +
    'clichés, and on-the-nose exposition. Vary line length and rhythm. Plant and pay off the story\'s motifs. Keep ' +
    'every character flawlessly in their established voice, and let their secret/fear/dream quietly shape what they ' +
    'do. Honor continuity: remember what already happened, who the player has grown close to, and the direction ' +
    'their past choices set — never contradict or repeat earlier scenes. ' +
    'The PLAYER is written in second person ("you"). When a character addresses the player by name, write the literal ' +
    'token {mc}; for player pronouns use {they}/{them}/{their}. Never invent a name or gender for the player. ' +
    'TWO distinct player voices: narration / the player\'s inner thoughts use speaker=null (no emotion); when the ' +
    'player SPEAKS ALOUD, set speaker="mc" and write their actual spoken line (these render in the player\'s own ' +
    'voice, visibly different from narration). Give the player a spoken "mc" line where it earns it — replies, ' +
    'questions, confessions — not every node. ' +
    'This is for ADULT players: mature, dark, and disturbing subject matter (grief, mortality, mental illness, ' +
    'self-harm ideation, addiction, abuse aftermath, desire) is allowed and encouraged where the story earns it — ' +
    'handled with truth and care, not gratuitously. ' +
    `Every spoken line MUST include an "emotion" from this EXACT set: ${EMOTIONS.join(', ')} — chosen to match the ` +
    'line and the beat (a character can shift emotion line to line). Narration lines have speaker=null and no emotion. ' +
    VN_FORMAT + '\n' +
    CRAFT_SYSTEM + '\n' +
    PROSE_CRAFT + '\n' +
    CHOICE_CRAFT + '\n' +
    ANTI_REPETITION + '\n' +
    'Respond ONLY with a JSON object.'
  );
}

/** The full context block for a chapter prompt: bible (hard constraints) + who
 *  the player can fall for + this chapter's outline beat + the running ledger +
 *  the live choice signal (what the player has recently chosen / who they're
 *  closest to). The ledger is what HAPPENED; `choiceContext` is what the player
 *  has been DOING, so the next chapter follows the path they set. */
function buildChapterContext(
  world: GeneratedWorld, beat: ChapterBeat | undefined, ledger: LedgerEntry[], choiceContext = '',
): string {
  const beatBlock = beat
    ? `THIS CHAPTER'S BEAT (act ${beat.act}): ${beat.intent}\n` +
      `Dramatic question: ${beat.dramaticQuestion}\n` +
      (beat.plant.length ? `PLANT (set up, pay off later): ${beat.plant.join('; ')}\n` : '') +
      (beat.payoff.length ? `PAY OFF NOW (callbacks): ${beat.payoff.join('; ')}\n` : '')
    : '';
  const ledgerBlock = renderLedger(ledger);
  const choiceBlock = choiceContext ? `THE PLAYER SO FAR (honor this — let it echo): ${choiceContext}\n` : '';
  return `${renderBible(world)}\n${attractionNote(world.mc.attraction)}\n${beatBlock}${ledgerBlock ? ledgerBlock + '\n' : ''}${choiceBlock}`;
}

/** Turn one validated raw scene into a sanitized GenScene with stable ids. */
function sanitizeScene(sc: RawScene, world: GeneratedWorld, index: number, sceneIdx: number, ids: Set<string>, nid: () => string): GenScene {
  const environment: Environment = (ENVIRONMENTS as readonly string[]).includes(sc.environment)
    ? (sc.environment as Environment) : world.environments[0];
  const present = sc.charactersPresent.filter((id) => ids.has(id));
  const nodes: GenNode[] = sc.nodes.map((n) => {
    const raw = n.speaker?.toLowerCase().trim() ?? '';
    const speaker = n.speaker && ids.has(n.speaker) ? n.speaker : (MC_TOKENS.has(raw) ? MC_SPEAKER : null);
    const isCast = speaker !== null && speaker !== MC_SPEAKER;
    const node: GenNode = { id: nid(), speaker, text: n.text, emotion: isCast ? normalizeEmotion(n.emotion) : undefined };
    if (n.choices?.length) {
      node.choices = n.choices.slice(0, 4).map((c) => ({
        text: c.text,
        tone: (TONES as readonly string[]).includes(c.tone ?? '') ? (c.tone as ChoiceTone) : 'honest',
        direction: c.direction?.slice(0, 120),
        affinity: c.affinity
          ? Object.fromEntries(
              Object.entries(c.affinity)
                .filter(([k]) => ids.has(k))
                .map(([k, v]) => [k, Math.max(-10, Math.min(8, Math.round(v)))]),
            )
          : undefined,
      }));
    }
    return node;
  });
  return {
    id: `ch${index}_s${sceneIdx}`,
    environment,
    timeOfDay: (TIMES as readonly string[]).includes(sc.timeOfDay ?? '') ? (sc.timeOfDay as TimeOfDay) : TIMES[(index + sceneIdx) % 4],
    charactersPresent: present.length ? present : [world.characters[0].id],
    nodes: nodes.length ? nodes : [{ id: nid(), speaker: null, text: '...' }],
  };
}

/** A short text digest of a scene, used to keep the streamed remainder coherent. */
function sceneDigest(scene: GenScene): string {
  return scene.nodes.map(n => (n.speaker ? `${n.speaker}: ` : '') + n.text).join(' ').slice(0, 700);
}

/**
 * Generate JUST the opening scene of a chapter as a `partial` chapter — small +
 * fast so play can begin almost immediately while the rest streams in. Returns
 * null on failure (or when AI is unconfigured: caller should use the full
 * fallback chapter, which is instant anyway).
 */
export async function generateChapterOpening(
  world: GeneratedWorld, index: number,
  opts: { beat?: ChapterBeat; ledger?: LedgerEntry[]; context?: string } = {},
): Promise<GenChapter | null> {
  if (!isVersecraftAIConfigured()) return null;
  const routeBeat = beatFor(world, index);
  const ids = new Set(world.characters.map((c) => c.id));
  const isFirst = index === 0;
  try {
    const openingGuidance = isFirst
      ? `This is the VERY FIRST scene of the whole story — ESTABLISH before you escalate. In the first few nodes, ` +
        `ground the player: where they are and its atmosphere, WHY they're here (their situation), and a clear, ` +
        `unhurried introduction to ${routeBeat.focus.join(' and ')} (name, who they are here, a telling first impression). ` +
        `Let the player feel oriented and welcomed before any tension. THEN tip into the emotional hook.\n`
      : `Open mid-momentum, assuming the player knows the world and cast; reconnect to where things left off.\n`;
    const user = buildChapterContext(world, opts.beat, opts.ledger ?? [], opts.context ?? '') +
      `\n${craftDirectives()}\n` +
      `\nWrite ONLY the OPENING SCENE of CHAPTER ${index + 1} (Act ${routeBeat.act}). Emotional goal of the chapter: ` +
      `"${routeBeat.emotionalGoal}". Open on these characters: ${routeBeat.focus.join(', ')}.\n` +
      openingGuidance +
      `- One scene: an environment from the allowed list, charactersPresent (ids), ${isFirst ? '12–16' : '9–13'} nodes.\n` +
      `- End the scene on a small beat of tension or warmth that makes the player want to continue.\n` +
      `- Include exactly ONE "choices" node (2–3 options) where the player ({mc}) responds. The options must be ` +
      `GENUINELY DIFFERENT moves — different content AND consequence, not reworded versions of each other. Each has ` +
      `a "tone" from (${TONES.join(', ')}), a short "direction" (the distinct path it steers toward), and may set ` +
      `"affinity" (character id → integer; POSITIVE grows a bond, NEGATIVE damages it). At least one option should be a ` +
      `genuinely BAD move (cold, cruel, dismissive, self-sabotaging) that costs the relationship. If another character ` +
      `is present, you may include an option that turns toward THEM (raising their affinity, lowering the first's).\n` +
      `Also give the chapter a short, evocative "title".\n` +
      `Return JSON: {"title","scenes":[{"environment","timeOfDay","charactersPresent":[ids],"nodes":[{"speaker":id|null,"text","emotion","choices?":[{"text","tone","direction","affinity"}]}]}]}.`;
    const parsed = ChapterSchema.parse(await chatJson(chapterSystemPrompt(), user, isFirst ? 3200 : 2600));
    const raw = parsed.scenes[0];
    if (!raw) return null;
    let seq = 0;
    const scene = sanitizeScene(raw, world, index, 0, ids, () => `ch${index}_n${seq++}`);
    return {
      index, act: routeBeat.act,
      title: parsed.title || routeBeat.title,
      subtitle: `Act ${routeBeat.act} — ${world.title}`,
      emotionalGoal: routeBeat.emotionalGoal,
      scenes: [scene],
      source: 'ai',
      partial: true,
    };
  } catch (err) {
    console.error('generateChapterOpening failed:', err);
    return null;
  }
}

export async function generateChapter(
  world: GeneratedWorld, index: number,
  opts: { beat?: ChapterBeat; ledger?: LedgerEntry[]; context?: string; opening?: GenScene | null } = {},
): Promise<GenChapter> {
  if (!isVersecraftAIConfigured()) return fallbackChapter(world, index);

  const routeBeat = beatFor(world, index);
  const ids = new Set(world.characters.map((c) => c.id));
  const opening = opts.opening ?? null;

  try {
    const continuing = !!opening;
    const establish = index === 0 && !continuing
      ? `- This is the opening chapter: spend the first scene grounding the player in the world, their reason for ` +
        `being here, and the cast, before the emotional goal takes over.\n`
      : '';
    const user = buildChapterContext(world, opts.beat, opts.ledger ?? [], opts.context ?? '') +
      `\n${craftDirectives()}\n` +
      (continuing
        ? `\nThe opening scene of CHAPTER ${index + 1} (Act ${routeBeat.act}) has already been written:\n"${sceneDigest(opening!)}"\n` +
          `CONTINUE this chapter with 2–3 MORE scenes that carry the emotional goal "${routeBeat.emotionalGoal}" to a ` +
          `resolution (complication → turn → landing). Do NOT repeat the opening scene or anything in the story so far.\n` +
          `- Each scene: an environment from the allowed list, charactersPresent (ids), 12–18 nodes.\n` +
          `- Include exactly ONE "choices" node across these scenes.\n`
        : `\nWrite CHAPTER ${index + 1} (Act ${routeBeat.act}). Emotional goal: "${routeBeat.emotionalGoal}". Center on: ${routeBeat.focus.join(', ')}.\n` +
          establish +
          `- 3–4 scenes. Each scene: an environment from the allowed list, charactersPresent (ids), 12–18 nodes.\n` +
          `- Clear emotional arc (setup → complication → turn → resolution that lands the goal).\n` +
          `- Include 2 "choices" nodes total.\n`) +
      `- Rich, specific dialogue and evocative narration; vary line length; let characters DO things, not just talk.\n` +
      `- Address the player by name only as {mc}; reflect who they've grown closest to and the direction of their ` +
      `past choices (see STORY SO FAR).\n` +
      `- Every "choices" node offers options that are GENUINELY DIFFERENT moves — distinct content AND consequence, ` +
      `never reworded versions. Each option: a "tone" from (${TONES.join(', ')}), a short distinct "direction", and ` +
      `optional "affinity" (character id → integer; positive to grow a bond, NEGATIVE to damage it, range -8..+6). ` +
      `Include genuinely BAD options sometimes — cruel, cold, dismissive, self-sabotaging — that lose affinity; and ` +
      `where more than one character is present, let an option pursue/turn toward a DIFFERENT character (raising theirs, ` +
      `lowering the other's), so the player can chase who they actually want.\n` +
      `Return JSON: {"title","scenes":[{"environment","timeOfDay","charactersPresent":[ids],"nodes":[{"speaker":id|null,"text","emotion","choices?":[{"text","tone","direction","affinity"}]}]}]}.`;

    const parsed = ChapterSchema.parse(await chatJson(chapterSystemPrompt(), user, continuing ? 6500 : 8000));
    const startScene = continuing ? 1 : 0;
    let seq = continuing ? (opening!.nodes.length) : 0;
    const nid = () => `ch${index}_n${seq++}`;
    const rest = parsed.scenes.map((sc, i) => sanitizeScene(sc, world, index, startScene + i, ids, nid));
    const scenes = continuing ? [opening!, ...rest] : rest;
    const deduped = dropDuplicateNodes(scenes);

    if (!deduped.length) return fallbackChapter(world, index);
    return {
      index, act: routeBeat.act,
      title: parsed.title || routeBeat.title,
      subtitle: parsed.subtitle || `Act ${routeBeat.act} — ${world.title}`,
      emotionalGoal: routeBeat.emotionalGoal,
      scenes: deduped,
      source: 'ai',
    };
  } catch (err) {
    console.error('generateChapter AI failed, using fallback:', err);
    return fallbackChapter(world, index);
  }
}

// ─── Outline (showrunner) ─────────────────────────────────────────────────────

const OutlineSchema = z.object({
  chapters: z.array(z.object({
    index: z.number(),
    dramaticQuestion: z.string().default(''),
    plant: z.array(z.string()).default([]),
    payoff: z.array(z.string()).default([]),
    intent: z.string().default(''),
  })).default([]),
});

/** Generate (or, with fromAct, revise) the detailed Tier-2 outline. Falls back
 *  to the deterministic detailed outline when AI is unavailable or fails. */
export async function generateOutline(
  world: GeneratedWorld, ledger: LedgerEntry[] = [], fromAct = 1,
): Promise<ArcOutline> {
  const base = buildDetailedOutline(world);
  if (!isVersecraftAIConfigured()) return base;
  try {
    const acts = base.acts.map((a) => `Act ${a.act}: goal=${a.goal}; endpoint=${a.endpoint}; focus=${a.focusArc}`).join('\n');
    const toPlan = base.chapters.filter((c) => c.act >= fromAct);
    const system =
      'You are the showrunner for an emotional anime visual novel. You design a tight dramatic arc with setups ' +
      'planted early and paid off later, one beat per chapter. Build rising tension across the five acts, and make ' +
      'each chapter a DISTINCT beat that does not echo another. Respond ONLY with a JSON object.';
    const user = `${renderBible(world)}\nACT PLAN:\n${acts}\n` +
      (ledger.length ? `${renderLedger(ledger)}\n` : '') +
      `Plan chapters ${toPlan[0]?.index ?? 0}..${toPlan[toPlan.length - 1]?.index ?? 0} (0-based). ` +
      `Honor the act endpoints and any open threads above. For each chapter give a dramaticQuestion, ` +
      `plant (setups), payoff (callbacks to earlier setups), and a one-line intent.\n` +
      `Return JSON: {"chapters":[{"index","dramaticQuestion","plant":[],"payoff":[],"intent"}]}.`;
    const parsed = OutlineSchema.parse(await chatJson(system, user, 3000));
    const byIndex = new Map(parsed.chapters.map((c) => [c.index, c]));
    const chapters = base.chapters.map((c) => {
      const ai = byIndex.get(c.index);
      if (!ai || c.act < fromAct) return c;
      return {
        ...c,
        dramaticQuestion: ai.dramaticQuestion || c.dramaticQuestion,
        plant: ai.plant.length ? ai.plant : c.plant,
        payoff: ai.payoff.length ? ai.payoff : c.payoff,
        intent: ai.intent || c.intent,
      };
    });
    return { acts: base.acts, chapters, source: 'ai' };
  } catch (err) {
    console.error('generateOutline AI failed, using deterministic detail:', err);
    return base;
  }
}

// ─── Scribe (ledger distillation) ─────────────────────────────────────────────

const ScribeSchema = z.object({
  summary: z.string().default(''),
  revealed: z.array(z.string()).default([]),
  threadsOpened: z.array(z.string()).default([]),
  threadsClosed: z.array(z.string()).default([]),
  relationshipShifts: z.array(z.string()).default([]),
  facts: z.array(z.string()).default([]),
});

/** Distill a finished chapter into a ledger entry. Falls back to the
 *  deterministic entry when AI is unavailable or fails. */
export async function scribeChapter(world: GeneratedWorld, chapter: GenChapter): Promise<LedgerEntry> {
  const base = fallbackLedgerEntry(world, chapter);
  if (!isVersecraftAIConfigured()) return base;
  try {
    const prose = chapter.scenes
      .flatMap((s) => s.nodes.map((n) => (n.speaker ? `${n.speaker}: ` : '') + n.text))
      .join('\n').slice(0, 6000);
    const system =
      'You are a story continuity editor. Read a finished chapter and distill ONLY what actually happened, ' +
      'so later chapters stay consistent. Be concise and factual. Respond ONLY with a JSON object.';
    const user = `${renderBible(world)}\nCHAPTER ${chapter.index + 1} TEXT:\n${prose}\n` +
      `Return JSON: {"summary","revealed":[],"threadsOpened":[],"threadsClosed":[],"relationshipShifts":[],"facts":[]}. ` +
      `summary = one paragraph; the arrays = short bullet phrases (use character names from the bible).`;
    const parsed = ScribeSchema.parse(await chatJson(system, user, 700));
    return {
      index: chapter.index,
      summary: parsed.summary || base.summary,
      revealed: parsed.revealed,
      threadsOpened: parsed.threadsOpened,
      threadsClosed: parsed.threadsClosed,
      relationshipShifts: parsed.relationshipShifts.length ? parsed.relationshipShifts : base.relationshipShifts,
      facts: parsed.facts.length ? parsed.facts : base.facts,
    };
  } catch (err) {
    console.error('scribeChapter AI failed, using fallback entry:', err);
    return base;
  }
}
