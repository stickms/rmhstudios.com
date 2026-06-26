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
import {
  EMOTIONS, ENVIRONMENTS, normalizeEmotion, WORLD_SCHEMA_VERSION,
  type GeneratedWorld, type GenChapter, type GenNode, type GenScene,
  type Pronouns, type Environment, type TimeOfDay, type ChoiceTone,
} from './world-types';

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
): Promise<GeneratedWorld> {
  const shell = fallbackWorld(seed, mcPrompt, playerName, playerPronouns);
  if (!isVersecraftAIConfigured()) return shell;

  try {
    const castSpec = shell.characters.map((c, i) =>
      `#${i} pronouns=${c.pronouns} archetype="${c.archetype}" age=${c.age}`).join('\n');
    const system =
      'You are the lead writer for VerseCraft, an emotional anime visual novel for ADULT players. You design a unique, ' +
      'character-driven cast for one playthrough. The story must be emotional but propelled by what the ' +
      'CHARACTERS choose to do, not by external plot. Avoid clichés and melodrama; aim for specific, ' +
      'aching, human detail. Mature, dark, and disturbing themes are welcome where they serve the story — ' +
      'grief, mortality, mental illness, self-harm ideation, estrangement, addiction, the aftermath of abuse, ' +
      'identity and desire — written with honesty, weight, and care, never gratuitously or as shock value. ' +
      'Respond ONLY with a JSON object.';
    const user =
      `Player character: ${playerName} (${playerPronouns}). Player's prompt for the kind of experience they want: ` +
      `"${mcPrompt || '(none — surprise me; usually a college student)'}".\n\n` +
      `Design the world and a cast of EXACTLY ${shell.characters.length} characters. Keep each character's ` +
      `index, pronouns, and archetype as given (write names/personalities that fit them):\n${castSpec}\n\n` +
      `Return JSON: {"title","tagline","premise","setting","motifs":[3 strings],"mcSituation",` +
      `"characters":[{"name","fullName","role","personality","speechStyle","background","secret","fear","dream","relationToMC"}]}. ` +
      `'secret' is the hidden thing driving their arc; 'fear' and 'dream' are deeply personal. ` +
      `The cast array MUST be length ${shell.characters.length}, in the same index order.`;

    const parsed = WorldEnrich.parse(await chatJson(system, user, 2200));
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
      mc: { ...shell.mc, situation: parsed.mcSituation || shell.mc.situation },
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
        affinity: z.record(z.string(), z.number()).optional(),
      })).optional(),
    })),
  })),
});

const TONES: ChoiceTone[] = ['kind', 'flirt', 'guarded', 'bold', 'honest', 'playful', 'deep'];
const TIMES: TimeOfDay[] = ['morning', 'afternoon', 'evening', 'night'];

export async function generateChapter(
  world: GeneratedWorld, index: number, contextSummary = '',
): Promise<GenChapter> {
  if (!isVersecraftAIConfigured()) return fallbackChapter(world, index);

  const beats = world.routePlan.beats;
  const beat = beats[Math.min(beats.length - 1, Math.floor((index / Math.max(1, world.routePlan.totalChapters)) * beats.length))];
  const ids = new Set(world.characters.map((c) => c.id));

  try {
    const cast = world.characters.map((c) =>
      `${c.id}: ${c.name} (${c.pronouns}) — ${c.archetype}, ${c.role}. ${c.personality} Speech: ${c.speechStyle}. Secret: ${c.secret}`).join('\n');
    const system =
      'You are the lead writer of VerseCraft, an emotional, character-driven anime visual novel in the vein of ' +
      'the best romance/drama VNs. Write ONE full chapter (15–20 minutes of reading). The drama must come from the ' +
      'CHARACTERS\' own choices, desires, and wounds — never from contrived external events. Show feelings through ' +
      'action, subtext, and specific sensory detail; avoid melodrama, clichés, and on-the-nose exposition. ' +
      'Plant and pay off the story\'s motifs. Keep every character flawlessly in their established voice and let ' +
      'their secret/fear/dream quietly shape what they do. ' +
      'This is for ADULT players: mature, dark, and disturbing subject matter (grief, mortality, mental illness, ' +
      'self-harm ideation, addiction, abuse aftermath, desire) is allowed and encouraged where the story earns it — ' +
      'handled with truth and care, not gratuitously. ' +
      `Every spoken line MUST include an "emotion" from this EXACT set: ${EMOTIONS.join(', ')} — chosen to match the ` +
      'line and the beat (a character can shift emotion line to line). Narration lines have speaker=null and no emotion. ' +
      'Respond ONLY with a JSON object.';
    const user =
      `STORY: "${world.title}". ${world.premise}\nSETTING: ${world.setting}\nTONE: ${world.toneTags.join(', ')}. MOTIFS: ${world.motifs.join(', ')}.\n` +
      `PLAYER: ${world.mc.name} (${world.mc.pronouns}) — ${world.mc.premise}\nCAST:\n${cast}\n` +
      `ALLOWED environments: ${world.environments.join(', ')}.\n` +
      (contextSummary ? `STORY SO FAR (honor this continuity): ${contextSummary}\n` : '') +
      `\nWrite CHAPTER ${index + 1} (Act ${beat.act}). Emotional goal of this chapter: "${beat.emotionalGoal}". ` +
      `Center it on these characters: ${beat.focus.join(', ')} (others may appear).\n` +
      `Requirements:\n` +
      `- 3–4 scenes. Each scene: one environment from the allowed list, charactersPresent (ids), and 12–18 nodes.\n` +
      `- Build a clear emotional arc across the chapter (setup → complication → turn → resolution that lands the goal).\n` +
      `- Rich, specific dialogue and evocative narration; vary line length; let characters DO things, not just talk.\n` +
      `- Include 2 "choices" nodes total across the chapter where ${world.mc.name} responds; each option has a "tone" from ` +
      `(${TONES.join(', ')}) and may set "affinity" (map of character id → small +integer 1–6) reflecting how that ` +
      `character would feel about the response.\n` +
      `Return JSON: {"title","scenes":[{"environment","timeOfDay","charactersPresent":[ids],"nodes":[{"speaker":id|null,"text","emotion","choices?":[{"text","tone","affinity"}]}]}]}.`;

    const parsed = ChapterSchema.parse(await chatJson(system, user, 7000));
    let seq = 0;
    const nid = () => `ch${index}_n${seq++}`;
    const scenes: GenScene[] = parsed.scenes.map((sc, si) => {
      const environment: Environment = (ENVIRONMENTS as readonly string[]).includes(sc.environment)
        ? (sc.environment as Environment) : world.environments[0];
      const present = sc.charactersPresent.filter((id) => ids.has(id));
      const nodes: GenNode[] = sc.nodes.map((n) => {
        const speaker = n.speaker && ids.has(n.speaker) ? n.speaker : null;
        const node: GenNode = {
          id: nid(),
          speaker,
          text: n.text,
          emotion: speaker ? normalizeEmotion(n.emotion) : undefined,
        };
        if (n.choices?.length) {
          node.choices = n.choices.slice(0, 3).map((c) => ({
            text: c.text,
            tone: (TONES as readonly string[]).includes(c.tone ?? '') ? (c.tone as ChoiceTone) : 'honest',
            affinity: c.affinity
              ? Object.fromEntries(Object.entries(c.affinity).filter(([k]) => ids.has(k)))
              : undefined,
          }));
        }
        return node;
      });
      return {
        id: `ch${index}_s${si}`,
        environment,
        timeOfDay: (TIMES as readonly string[]).includes(sc.timeOfDay ?? '') ? (sc.timeOfDay as TimeOfDay) : TIMES[(index + si) % 4],
        charactersPresent: present.length ? present : [world.characters[0].id],
        nodes: nodes.length ? nodes : [{ id: nid(), speaker: null, text: '...' }],
      };
    });

    if (!scenes.length) return fallbackChapter(world, index);
    return {
      index, act: beat.act,
      title: parsed.title || beat.title,
      subtitle: parsed.subtitle || `Act ${beat.act} — ${world.title}`,
      emotionalGoal: beat.emotionalGoal,
      scenes,
      source: 'ai',
    };
  } catch (err) {
    console.error('generateChapter AI failed, using fallback:', err);
    return fallbackChapter(world, index);
  }
}
