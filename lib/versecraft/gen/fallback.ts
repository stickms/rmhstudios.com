// ─── Deterministic Fallback Generator ─────────────────────────────────────────
// Produces a complete, coherent, emotion-tagged world + chapters from a seed
// with NO network calls. Used when DeepSeek is unconfigured or fails, and as the
// structural scaffold the AI generator fills. Pure + deterministic: same seed →
// same story, which is what makes a "version" shareable.

import { Rng } from './rng';
import { PackAssigner } from '../sprites/assign';
import { getPack } from '../sprites/registry';
import {
  SETTINGS, NAMES, SURNAMES, ARCHETYPES, SECRETS, FEARS, DREAMS, SPEECH_STYLES,
  type SettingTemplate,
} from './banks';
import {
  normalizeEmotion, WORLD_SCHEMA_VERSION,
  type GeneratedWorld, type GeneratedCharacter, type GenChapter, type GenScene,
  type GenNode, type Pronouns, type Emotion, type Environment, type TimeOfDay,
  type RoutePlan, type StoryBeat,
} from './world-types';

const PRESENTATIONS: { p: Pronouns; key: 'feminine' | 'masculine' | 'neutral' }[] = [
  { p: 'she/her', key: 'feminine' },
  { p: 'he/him', key: 'masculine' },
  { p: 'they/them', key: 'neutral' },
];

function pickSetting(rng: Rng, mcPrompt: string): SettingTemplate {
  const low = mcPrompt.toLowerCase();
  const matched = SETTINGS.filter((s) => s.keywords.some((k) => low.includes(k)));
  if (matched.length) return rng.pick(matched);
  return rng.pick(SETTINGS);
}

const TOTAL_CHAPTERS = 26;
const ACT_COUNT = 5;

function buildRoutePlan(rng: Rng, characters: GeneratedCharacter[]): RoutePlan {
  // 5 acts: meeting → deepening → fracture → revelation → resolution.
  const arcs: { title: string; goal: string }[][] = [
    [{ title: 'first meeting', goal: 'curiosity and the spark of belonging' }, { title: 'finding a place', goal: 'tentative warmth' }],
    [{ title: 'getting closer', goal: 'intimacy and small confessions' }, { title: 'the good days', goal: 'joy shadowed by what\'s unsaid' }],
    [{ title: 'the first crack', goal: 'tension surfacing' }, { title: 'the fracture', goal: 'hurt and conflict' }],
    [{ title: 'the truth comes out', goal: 'a secret laid bare' }, { title: 'fallout', goal: 'grief and decision' }],
    [{ title: 'reaching back', goal: 'repair and choice' }, { title: 'the last scene', goal: 'bittersweet resolution' }],
  ];
  const beats: StoryBeat[] = [];
  for (let act = 0; act < ACT_COUNT; act++) {
    for (const b of arcs[act]) {
      beats.push({
        act: act + 1,
        title: b.title,
        emotionalGoal: b.goal,
        focus: rng.sample(characters.map((c) => c.id), Math.min(2, characters.length)),
      });
    }
  }
  return { totalChapters: TOTAL_CHAPTERS, actCount: ACT_COUNT, beats };
}

export function fallbackWorld(seed: string, mcPrompt: string, playerName = 'You', playerPronouns: Pronouns = 'they/them'): GeneratedWorld {
  const rng = new Rng(`world|${seed}|${mcPrompt}`);
  const setting = pickSetting(rng, mcPrompt);
  const assigner = new PackAssigner();

  const count = rng.int(4, 5);
  const usedNames = new Set<string>();
  const usedArche = new Set<number>();
  const usedRoles = new Set<number>();

  const characters: GeneratedCharacter[] = [];
  for (let i = 0; i < count; i++) {
    const pres = rng.pick(PRESENTATIONS);
    let name = rng.pick(NAMES[pres.key]);
    for (let t = 0; t < 6 && usedNames.has(name); t++) name = rng.pick(NAMES[pres.key]);
    usedNames.add(name);

    let aIdx = rng.int(0, ARCHETYPES.length - 1);
    for (let t = 0; t < 6 && usedArche.has(aIdx); t++) aIdx = rng.int(0, ARCHETYPES.length - 1);
    usedArche.add(aIdx);
    const arche = ARCHETYPES[aIdx];

    let rIdx = rng.int(0, setting.roles.length - 1);
    for (let t = 0; t < 6 && usedRoles.has(rIdx); t++) rIdx = rng.int(0, setting.roles.length - 1);
    usedRoles.add(rIdx);

    // The last character is often an older mentor figure.
    const mature = i === count - 1 && rng.bool(0.45);
    const pack = assigner.assign(rng, { pronouns: pres.p, mature });
    const packMeta = getPack(pack.id);

    const id = `c${i + 1}_${name.toLowerCase()}`;
    characters.push({
      id,
      name,
      fullName: `${name} ${rng.pick(SURNAMES)}`,
      pronouns: pres.p,
      age: mature ? rng.int(31, 44) : rng.int(18, 23),
      role: setting.roles[rIdx],
      archetype: arche.name,
      personality: arche.personality,
      speechStyle: rng.pick(SPEECH_STYLES),
      background: `Came to ${setting.title} carrying more than they let on.`,
      secret: `Secretly ${rng.pick(SECRETS)}.`,
      fear: `Afraid of ${rng.pick(FEARS)}.`,
      dream: `Dreams ${rng.pick(DREAMS)}.`,
      relationToMC: i === 0 ? 'the first to welcome you in' : rng.pick([
        'wary of you at first', 'drawn to you immediately', 'your unlikely mirror',
        'the one who challenges you', 'quietly watching from the edges',
      ]),
      emotionalDefault: normalizeEmotion(arche.emotionalDefault),
      packId: pack.id,
      color: packMeta?.accent ?? '#c4a35a',
      accentColor: packMeta?.accent ?? '#e0c890',
      romanceable: !mature,
    });
  }

  return {
    schema: WORLD_SCHEMA_VERSION,
    seed,
    mcPrompt,
    source: 'fallback',
    title: setting.title,
    tagline: rng.pick(['Some doors only open once.', 'Everyone here is a poem half-written.', 'You arrived just in time to lose them.', 'Stay long enough to be changed.']),
    premise: setting.premise.replaceAll('{mc}', playerName),
    setting: setting.setting,
    toneTags: setting.toneTags,
    motifs: rng.shuffle(setting.motifs).slice(0, 3),
    environments: setting.environments,
    mc: {
      name: playerName,
      pronouns: playerPronouns,
      premise: mcPrompt.trim()
        ? `You are ${mcPrompt.trim()}`
        : 'You are a college student who has been drifting, looking for somewhere that feels like yours.',
      situation: `On an ordinary afternoon, you cross paths with ${setting.title}, and nothing after stays ordinary.`,
    },
    characters,
    routePlan: buildRoutePlan(rng, characters),
    createdAt: 0,
  };
}

// ─── Chapter assembly ─────────────────────────────────────────────────────────

const TIMES: TimeOfDay[] = ['morning', 'afternoon', 'evening', 'night'];

/** Map an index across the 5 acts. */
function beatForIndex(world: GeneratedWorld, index: number): StoryBeat {
  const beats = world.routePlan.beats;
  const ratio = index / Math.max(1, world.routePlan.totalChapters);
  const beatIdx = Math.min(beats.length - 1, Math.floor(ratio * beats.length));
  return beats[beatIdx];
}

function charById(world: GeneratedWorld, id: string): GeneratedCharacter | undefined {
  return world.characters.find((c) => c.id === id);
}

// Emotion-tagged line templates keyed loosely by the beat's mood word.
function moodEmotion(goal: string, rng: Rng): Emotion {
  const g = goal.toLowerCase();
  if (g.includes('joy') || g.includes('warm') || g.includes('good')) return rng.pick(['happy', 'joyful', 'confident'] as Emotion[]);
  if (g.includes('hurt') || g.includes('conflict') || g.includes('fracture') || g.includes('tension')) return rng.pick(['angry', 'hurt', 'annoyed'] as Emotion[]);
  if (g.includes('grief') || g.includes('secret') || g.includes('bare') || g.includes('bittersweet')) return rng.pick(['sad', 'crying', 'hurt'] as Emotion[]);
  if (g.includes('intimacy') || g.includes('confession') || g.includes('repair')) return rng.pick(['blush', 'nervous', 'happy'] as Emotion[]);
  return rng.pick(['neutral', 'thoughtful', 'nervous'] as Emotion[]);
}

function characterLine(c: GeneratedCharacter, mood: Emotion, mc: string, motif: string, rng: Rng): string {
  const lines: Record<string, string[]> = {
    happy: [`"You actually came back. I— that means more than it should."`, `"Stay. The light's good and you're here. That's enough for one day."`],
    joyful: [`"Okay okay — watch this. I've been saving it for someone who'd get it. For you, ${mc}."`, `"This is the best it's been in months and I refuse to pretend otherwise."`],
    confident: [`"I know what we are. I knew the second you walked in. The rest of them are still catching up."`, `"Don't flinch now. We're just getting to the part that matters."`],
    nervous: [`"Don't— don't look at me like that. I'm not used to anyone actually listening."`, `"I rehearsed this. I had a whole— never mind. Hi."`],
    blush: [`"I wrote about ${motif}. About you, if I'm honest. Which I'm apparently being now."`, `"Stop. You can't just say things like that and watch my face do this."`],
    thoughtful: [`"Funny how ${motif} keeps coming back. Maybe some things just want to be noticed."`, `"I've been trying to figure you out. I don't usually bother."`],
    annoyed: [`"You think it's that simple? You've been here five minutes and you've got us all figured out?"`, `"Don't. Don't do the understanding thing right now. I can't take it from you today."`],
    angry: [`"You knew. You knew and you let me keep going like an idiot. Say something true for once."`, `"I'm not yelling about ${motif}. You know that's not what this is."`],
    sad: [`"It was supposed to last longer than this. All of it. You. Me. ${motif}."`, `"I keep almost telling you. Then I look at you and I lose my nerve."`],
    crying: [`"I'm sorry. I'm so— I didn't want you to see me like this. Not you."`, `"Please don't go yet. If you go I'll have to admit it's real."`],
    hurt: [`"I trusted you with the one thing I never say. And now you're looking at me like that."`, `"It's fine. It's fine. People leave. I just thought— it doesn't matter what I thought."`],
    surprised: [`"Wait— you remembered that? I said it once. Months ago. To you."`, `"You're serious. You're actually serious."`],
    neutral: [`"You're early. Nobody's ever early for this."`, `"Sit anywhere. We don't really do assigned seats here."`],
    smirk: [`"Oh, you're trouble. I can already tell. Good. We're short on trouble."`, `"Careful, ${mc}. Keep showing up like this and people might think you care."`],
    afraid: [`"Something's wrong. I can feel it. Tell me I'm imagining it. Lie to me if you have to."`],
    tired: [`"I'm running on nothing. But you showed up, so. Here I am, running on nothing, for you."`],
  };
  const pool = lines[mood] ?? lines.neutral;
  return rng.pick(pool);
}

function narration(env: Environment, mood: Emotion, motif: string, world: GeneratedWorld, rng: Rng): string {
  const place = env.replaceAll('_', ' ');
  const weather: Record<string, string[]> = {
    happy: [`The ${place} feels, for once, like it belongs to all of you.`, `Light pools across the ${place} and nobody is in a hurry to leave.`],
    sad: [`The ${place} is quieter than it should be. ${motif[0].toUpperCase() + motif.slice(1)} sits between you like a third person.`, `Something has thinned in the air of the ${place}, the way it does before a goodbye.`],
    angry: [`The ${place} goes taut. The kind of silence that's louder than shouting.`, `Whatever was holding the ${place} together has started, audibly, to give.`],
    neutral: [`Afternoon settles over the ${place}. ${world.title} is exactly as you left it, and somehow not.`, `You find the ${place} half-full and entirely familiar now.`],
    nervous: [`The ${place} holds its breath with you.`, `Everyone in the ${place} is pretending not to wait for something.`],
  };
  const pool = weather[mood] ?? weather.neutral;
  return rng.pick(pool);
}

export function fallbackChapter(world: GeneratedWorld, index: number): GenChapter {
  const rng = new Rng(`chapter|${world.seed}|${index}`);
  const beat = beatForIndex(world, index);
  const focusChars = (beat.focus.length ? beat.focus : world.characters.map((c) => c.id))
    .map((id) => charById(world, id))
    .filter((c): c is GeneratedCharacter => !!c);
  const lead = focusChars[0] ?? world.characters[0];
  const second = focusChars[1] ?? world.characters[1 % world.characters.length];
  const mc = world.mc.name;
  const motif = rng.pick(world.motifs);
  const sceneCount = rng.int(2, 3);

  const scenes: GenScene[] = [];
  let nodeSeq = 0;
  const nid = () => `ch${index}_n${nodeSeq++}`;

  for (let s = 0; s < sceneCount; s++) {
    const env = rng.pick(world.environments);
    const timeOfDay = TIMES[(index + s) % TIMES.length];
    const present = rng.shuffle([lead.id, second.id]).slice(0, rng.int(1, 2));
    const mood = moodEmotion(beat.emotionalGoal, rng);
    const nodes: GenNode[] = [];

    nodes.push({ id: nid(), speaker: null, text: narration(env, mood, motif, world, rng) });

    const speaker = charById(world, present[0]) ?? lead;
    nodes.push({ id: nid(), speaker: speaker.id, text: characterLine(speaker, mood, mc, motif, rng), emotion: mood });

    // A choice that nudges affinity toward the focus characters.
    if (s === 0) {
      nodes.push({
        id: nid(), speaker: null, text: `${speaker.name} waits. Whatever you say next will matter more than usual.`,
        choices: [
          { text: `Meet ${speaker.name} where they are.`, tone: 'kind', affinity: { [speaker.id]: 4 }, flags: { last_tone: 'kind' } },
          { text: 'Say the harder, truer thing.', tone: 'honest', affinity: { [speaker.id]: 6 }, flags: { last_tone: 'honest' } },
          { text: 'Deflect. It\'s safer.', tone: 'guarded', affinity: { [speaker.id]: 1 }, flags: { last_tone: 'guarded' } },
        ],
      });
      nodes.push({ id: nid(), speaker: speaker.id, text: characterLine(speaker, mood, mc, motif, rng.fork('react')), emotion: mood });
    }

    // Second character reacts if present.
    if (present.length > 1) {
      const other = charById(world, present[1]) ?? second;
      const om = moodEmotion(beat.emotionalGoal, rng.fork('o'));
      nodes.push({ id: nid(), speaker: other.id, text: characterLine(other, om, mc, motif, rng.fork('ol')), emotion: om });
    }

    nodes.push({ id: nid(), speaker: null, text: rng.pick([
      `You let the moment land. Some things you only get to feel once.`,
      `Later you'll replay this. You already know it.`,
      `The ${beat.title} of it all settles into your chest and stays.`,
    ]) });

    scenes.push({ id: `ch${index}_s${s}`, environment: env, timeOfDay, charactersPresent: present, nodes });
  }

  const act = beat.act;
  return {
    index,
    act,
    title: titleCase(beat.title),
    subtitle: `Act ${act} — ${world.title}`,
    emotionalGoal: beat.emotionalGoal,
    scenes,
    source: 'fallback',
  };
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}
