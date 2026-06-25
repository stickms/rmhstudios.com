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
    happy: [`"You actually came back. That— means more than it should."`, `"Stay. The light's good and you're here. That's enough for one day."`, `"I forget, sometimes, that it can feel like this. Thank you."`],
    joyful: [`"Watch this. I've been saving it for someone who'd get it. For you, ${mc}."`, `"This is the best it's been in months and I refuse to pretend otherwise."`, `"God, I missed laughing. When did I stop?"`],
    confident: [`"I knew what we'd be the second you walked in. The rest of them are still catching up."`, `"Don't flinch now. We're getting to the part that matters."`, `"I'm done apologizing for wanting more than this. Aren't you?"`],
    nervous: [`"Don't— don't look at me like that. I'm not used to anyone actually listening."`, `"I rehearsed this. I had a whole— never mind. Hi."`, `"If I say it out loud it becomes real, and then I have to do something about it."`],
    blush: [`"I wrote about ${motif}. About you, if I'm honest. Which I apparently am now."`, `"Stop. You can't just say things like that and watch my face do this."`, `"This is the part where I'd normally make a joke. I've got nothing."`],
    thoughtful: [`"Funny how ${motif} keeps coming back. Maybe some things just want to be noticed."`, `"I've been trying to figure you out. I don't usually bother."`, `"Do you ever feel like you're the only one who sees the cracks in all of this?"`],
    annoyed: [`"You've been here five minutes and you think you've got us figured out?"`, `"Don't do the understanding thing right now. I can't take it from you today."`, `"I'm fine. I said I'm fine. Why does everyone keep— "`],
    angry: [`"You knew. You knew and you let me keep going like an idiot. Say something true for once."`, `"This isn't about ${motif} and you know it."`, `"I am so tired of being the one who holds it together while the rest of you fall apart."`],
    sad: [`"It was supposed to last longer than this. All of it. You. Me. ${motif}."`, `"I keep almost telling you. Then I look at you and I lose my nerve."`, `"Some days I'm not sure I want to be here at all. Here, I mean. In any of it."`, `"I'm not okay. I haven't been for a long time. I just got good at the costume."`],
    crying: [`"I'm sorry. I didn't want you to see me like this. Not you."`, `"Please don't go yet. If you go I'll have to admit it's real."`, `"It hurts in a place I can't point to. Does that make sense? Tell me that makes sense."`],
    hurt: [`"I trusted you with the one thing I never say. And now you're looking at me like that."`, `"People leave. I just— I let myself think you wouldn't."`, `"You don't get to be gentle with me right after. That's worse."`],
    surprised: [`"Wait— you remembered that? I said it once. Months ago. To you."`, `"You're serious. You're actually serious."`, `"Nobody's ever— okay. Okay, give me a second."`],
    neutral: [`"You're early. Nobody's ever early for this."`, `"Sit anywhere. We don't really do assigned seats."`, `"So. You stayed. Most people don't."`],
    smirk: [`"Oh, you're trouble. I can tell. Good — we're short on trouble."`, `"Careful, ${mc}. Keep showing up like this and people might think you care."`, `"You want the real version or the one I tell everyone else?"`],
    afraid: [`"Something's wrong. Tell me I'm imagining it. Lie to me if you have to."`, `"If this falls apart, I don't— I don't know who I am after."`, `"Don't make me say what I'm scared of. Saying it invites it in."`],
    tired: [`"I'm running on nothing. But you showed up, so. Here I am, running on nothing, for you."`, `"I can't keep doing this. I just don't know how to stop."`],
  };
  void c;
  const pool = lines[mood] ?? lines.neutral;
  return rng.pick(pool);
}

/** Narration of a character DOING something tied to their wound — keeps the
 *  story character-action-driven rather than just talking heads. */
function actionBeat(c: GeneratedCharacter, mc: string, rng: Rng): string {
  return rng.pick([
    `${c.name} won't quite meet your eyes — ${c.fear.toLowerCase().replace(/^afraid of /, 'the fear of ')} is written all over the way they hold themselves.`,
    `${c.name} starts to say something, stops, and does the small brave thing instead: they stay.`,
    `You catch ${c.name} mid-gesture, caught between the person everyone sees and the one ${c.dream.toLowerCase().replace(/^dreams /, 'dreams ')}.`,
    `Something shifts in ${c.name}. For a second the mask slips, and you see exactly how much it costs them to be here.`,
    `${c.name} reaches for the easy joke, the easy exit — and, looking at you, chooses neither.`,
  ]);
}

function narration(env: Environment, mood: Emotion, motif: string, world: GeneratedWorld, rng: Rng): string {
  const place = env.replaceAll('_', ' ');
  const M = motif[0].toUpperCase() + motif.slice(1);
  const weather: Record<string, string[]> = {
    happy: [`The ${place} feels, for once, like it belongs to all of you.`, `Light pools across the ${place} and nobody's in a hurry to leave.`],
    joyful: [`For a little while the ${place} is loud with the good kind of noise.`, `Whatever's coming, the ${place} holds this one bright hour first.`],
    sad: [`The ${place} is quieter than it should be. ${M} sits between you like a third person.`, `Something has thinned in the air of the ${place}, the way it does before a goodbye.`],
    crying: [`The ${place} blurs at the edges. ${M} again — always ${motif}.`, `Nobody in the ${place} knows what to say, so nobody says anything.`],
    angry: [`The ${place} goes taut — the kind of silence louder than shouting.`, `Whatever was holding the ${place} together has started, audibly, to give.`],
    afraid: [`The ${place} feels wrong in a way you can't name yet.`, `Dread moves through the ${place} like a draft under a door.`],
    neutral: [`${world.title} is exactly as you left it, and somehow not.`, `You find the ${place} half-full and entirely familiar now.`],
    nervous: [`The ${place} holds its breath with you.`, `Everyone in the ${place} is pretending not to wait for something.`],
  };
  const pool = weather[mood] ?? weather.neutral;
  return rng.pick(pool);
}

function makeChoice(speaker: GeneratedCharacter, mood: Emotion) {
  const heavy = mood === 'sad' || mood === 'crying' || mood === 'hurt' || mood === 'afraid' || mood === 'angry';
  return {
    id: '',
    speaker: null as string | null,
    text: `${speaker.name} waits. Whatever you say next will matter more than usual.`,
    choices: heavy ? [
      { text: `Stay in it with ${speaker.name}. Don't fix, just be there.`, tone: 'kind' as const, affinity: { [speaker.id]: 5 }, flags: { last_tone: 'kind' } },
      { text: 'Name the hard truth, gently.', tone: 'honest' as const, affinity: { [speaker.id]: 6 }, flags: { last_tone: 'honest' } },
      { text: 'Pull back. You\'re not sure you can hold this.', tone: 'guarded' as const, affinity: { [speaker.id]: 1 }, flags: { last_tone: 'guarded' } },
    ] : [
      { text: `Meet ${speaker.name} where they are.`, tone: 'kind' as const, affinity: { [speaker.id]: 4 }, flags: { last_tone: 'kind' } },
      { text: 'Push, just a little. See what\'s underneath.', tone: 'bold' as const, affinity: { [speaker.id]: 5 }, flags: { last_tone: 'bold' } },
      { text: 'Tease them. Keep it light.', tone: 'playful' as const, affinity: { [speaker.id]: 3 }, flags: { last_tone: 'playful' } },
    ],
  };
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
  const sceneCount = rng.int(3, 4);
  // Two choice points across the chapter (first and a later scene).
  const choiceScenes = new Set<number>([0, Math.min(sceneCount - 1, 2)]);

  const scenes: GenScene[] = [];
  let nodeSeq = 0;
  const nid = () => `ch${index}_n${nodeSeq++}`;

  for (let s = 0; s < sceneCount; s++) {
    const env = world.environments[(index + s) % world.environments.length];
    const timeOfDay = TIMES[(index + s) % TIMES.length];
    const pair = rng.shuffle([lead.id, second.id]);
    const present = s === 1 ? [pair[0]] : pair.slice(0, rng.int(1, 2));
    const speaker = charById(world, present[0]) ?? lead;
    const other = present[1] ? charById(world, present[1]) : null;
    const mood = moodEmotion(beat.emotionalGoal, rng.fork(`m${s}`));
    const nodes: GenNode[] = [];
    const push = (speakerId: string | null, text: string, emotion?: Emotion) =>
      nodes.push({ id: nid(), speaker: speakerId, text, emotion });

    push(null, narration(env, mood, motif, world, rng));
    push(null, actionBeat(speaker, mc, rng.fork(`a${s}`)));
    push(speaker.id, characterLine(speaker, mood, mc, motif, rng.fork(`l${s}a`)), mood);
    if (other) push(other.id, characterLine(other, moodEmotion(beat.emotionalGoal, rng.fork(`o${s}`)), mc, motif, rng.fork(`o${s}l`)), moodEmotion(beat.emotionalGoal, rng.fork(`o${s}e`)));
    push(speaker.id, characterLine(speaker, mood, mc, motif, rng.fork(`l${s}b`)), mood);

    if (choiceScenes.has(s)) {
      const ch = makeChoice(speaker, mood);
      nodes.push({ id: nid(), speaker: ch.speaker, text: ch.text, choices: ch.choices });
      push(speaker.id, characterLine(speaker, mood, mc, motif, rng.fork(`l${s}r`)), mood);
    }

    // a turn / escalation
    push(null, rng.pick([
      `The conversation tips somewhere neither of you planned.`,
      `${speaker.name}'s ${beat.emotionalGoal.split(' ')[0]} fills the room.`,
      `You feel the chapter of this turning under your hands.`,
    ]));
    push(speaker.id, characterLine(speaker, moodEmotion(beat.emotionalGoal, rng.fork(`c${s}`)), mc, motif, rng.fork(`l${s}c`)), moodEmotion(beat.emotionalGoal, rng.fork(`c${s}e`)));
    if (other) push(other.id, characterLine(other, mood, mc, motif, rng.fork(`o${s}2`)), mood);

    push(null, rng.pick([
      `You let the moment land. Some things you only get to feel once.`,
      `Later you'll replay this. You already know it.`,
      `The ${beat.title} of it all settles into your chest and stays.`,
      `Whatever happens next, this is now part of the story you share.`,
    ]));

    scenes.push({ id: `ch${index}_s${s}`, environment: env, timeOfDay, charactersPresent: present, nodes });
  }

  return {
    index,
    act: beat.act,
    title: titleCase(beat.title),
    subtitle: `Act ${beat.act} — ${world.title}`,
    emotionalGoal: beat.emotionalGoal,
    scenes,
    source: 'fallback',
  };
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}
