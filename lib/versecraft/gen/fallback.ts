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

/** Pick an item not yet used this chapter (resets only if the pool is exhausted),
 *  so the fallback writer never repeats the same line within a chapter. */
function pickUnique(pool: string[], rng: Rng, used: Set<string>): string {
  const fresh = pool.filter((p) => !used.has(p));
  const chosen = rng.pick(fresh.length ? fresh : pool);
  used.add(chosen);
  return chosen;
}

function characterLine(c: GeneratedCharacter, mood: Emotion, mc: string, motif: string, rng: Rng, used: Set<string>): string {
  const lines: Record<string, string[]> = {
    happy: [
      `"You actually came back. That— means more than it should."`,
      `"Stay. The light's good and you're here. That's enough for one day."`,
      `"I forget, sometimes, that it can feel like this. Thank you."`,
      `"You make the room bigger somehow. Don't tell anyone I said that."`,
      `"I had a whole list of things to worry about, and then you walked in and I forgot all of them."`,
      `"Is it stupid that this — just this — is the best part of my week?"`,
      `"I keep waiting for the catch. Maybe there isn't one this time."`,
    ],
    joyful: [
      `"Watch this. I've been saving it for someone who'd get it. For you, ${mc}."`,
      `"This is the best it's been in months and I refuse to pretend otherwise."`,
      `"God, I missed laughing. When did I even stop?"`,
      `"Come here, come here — you have to see it before the light goes."`,
      `"Okay that was perfect, that was actually perfect, don't ruin it."`,
      `"I want to bottle this exact minute and open it on a bad day."`,
    ],
    confident: [
      `"I knew what we'd be the second you walked in. The rest of them are still catching up."`,
      `"Don't flinch now. We're getting to the part that matters."`,
      `"I'm done apologizing for wanting more than this. Aren't you?"`,
      `"Let them stare. I've spent my whole life being quiet. Not anymore."`,
      `"I'm not asking permission. I'm telling you what I'm going to do."`,
      `"Scared? A little. Doing it anyway. That's the whole trick."`,
    ],
    nervous: [
      `"Don't— don't look at me like that. I'm not used to anyone actually listening."`,
      `"I rehearsed this. I had a whole— never mind. Hi."`,
      `"If I say it out loud it becomes real, and then I have to do something about it."`,
      `"You're going to think it's small. It isn't small to me."`,
      `"Give me a second. I'm trying to be brave and it's not really my thing."`,
      `"Is it warm in here or is that just me actively malfunctioning?"`,
    ],
    blush: [
      `"I wrote about ${motif}. About you, if I'm honest. Which I apparently am now."`,
      `"Stop. You can't just say things like that and watch my face do this."`,
      `"This is the part where I'd normally make a joke. I've got nothing."`,
      `"Why do you remember the small things? Nobody remembers the small things."`,
      `"Okay, I'm — I'm going to need you to look away for a second."`,
    ],
    thoughtful: [
      `"Funny how ${motif} keeps coming back. Maybe some things just want to be noticed."`,
      `"I've been trying to figure you out. I don't usually bother."`,
      `"Do you ever feel like you're the only one who sees the cracks in all of this?"`,
      `"I keep thinking about what you said last time. I think you were right. Annoyingly."`,
      `"There's a version of me that does the brave thing. I'm trying to find where they live."`,
      `"What do you actually want? Not the safe answer. The real one."`,
    ],
    annoyed: [
      `"You've been here five minutes and you think you've got us figured out?"`,
      `"Don't do the understanding thing right now. I can't take it from you today."`,
      `"I'm fine. I said I'm fine. Why does everyone keep—"`,
      `"Could you not? For one hour? Just — not."`,
      `"I don't need fixing. I need everyone to stop hovering."`,
    ],
    angry: [
      `"You knew. You knew and you let me keep going like an idiot. Say something true for once."`,
      `"This isn't about ${motif} and you know it."`,
      `"I am so tired of being the one who holds it together while the rest of you fall apart."`,
      `"Don't you dare make this small. Not after everything."`,
      `"I trusted you with it. With the real thing. And this is what you did."`,
      `"Say it. Look at me and say it to my face."`,
    ],
    sad: [
      `"It was supposed to last longer than this. All of it. You. Me. ${motif}."`,
      `"I keep almost telling you. Then I look at you and I lose my nerve."`,
      `"Some days I'm not sure I want to be here at all. Here, in any of it."`,
      `"I'm not okay. I haven't been for a long time. I just got good at the costume."`,
      `"Everyone leaves eventually. I just thought I'd get more time before you did."`,
      `"I'm so tired of pretending the missing part isn't missing."`,
      `"Don't remember me like this. Remember the good version. Please."`,
    ],
    crying: [
      `"I'm sorry. I didn't want you to see me like this. Not you."`,
      `"Please don't go yet. If you go I'll have to admit it's real."`,
      `"It hurts in a place I can't point to. Does that make sense? Tell me it does."`,
      `"I've been holding this so long my hands forgot how to open."`,
      `"I don't know how to put it down. Will you just — stay until I figure it out?"`,
    ],
    hurt: [
      `"I trusted you with the one thing I never say. And now you're looking at me like that."`,
      `"People leave. I just— I let myself think you wouldn't."`,
      `"You don't get to be gentle with me right after. That's worse."`,
      `"I made room for you. That's the part I can't forgive myself for."`,
      `"It's fine. It's always fine. I've had a lot of practice at fine."`,
    ],
    surprised: [
      `"Wait— you remembered that? I said it once. Months ago. To you."`,
      `"You're serious. You're actually serious."`,
      `"Nobody's ever— okay. Okay, give me a second."`,
      `"That's not— I didn't think anyone was paying attention."`,
    ],
    neutral: [
      `"You're early. Nobody's ever early for this."`,
      `"Sit anywhere. We don't really do assigned seats."`,
      `"So. You stayed. Most people don't."`,
      `"You always show up at the strangest, most exactly-right times."`,
      `"Tell me something true. Doesn't have to be big."`,
    ],
    smirk: [
      `"Oh, you're trouble. I can tell. Good — we're short on trouble."`,
      `"Careful, ${mc}. Keep showing up like this and people might think you care."`,
      `"You want the real version or the one I tell everyone else?"`,
      `"I had a comeback ready. You went and disarmed me. Rude."`,
      `"Look at you, pretending you don't already know how this ends."`,
    ],
    afraid: [
      `"Something's wrong. Tell me I'm imagining it. Lie to me if you have to."`,
      `"If this falls apart, I don't— I don't know who I am after."`,
      `"Don't make me say what I'm scared of. Saying it invites it in."`,
      `"Promise you won't look at me differently. Promise first."`,
    ],
    tired: [
      `"I'm running on nothing. But you showed up, so. Here I am, running on nothing, for you."`,
      `"I can't keep doing this. I just don't know how to stop."`,
      `"Some mornings the hardest thing is the getting-up. Today you made it easier."`,
    ],
  };
  void c;
  return pickUnique(lines[mood] ?? lines.neutral, rng, used);
}

/** Narration of a character DOING something tied to their wound — keeps the
 *  story character-action-driven rather than just talking heads. */
function actionBeat(c: GeneratedCharacter, rng: Rng, used: Set<string>): string {
  const fear = c.fear.toLowerCase().replace(/^afraid of /, 'the fear of ');
  const dream = c.dream.toLowerCase().replace(/^dreams /, 'dreams ');
  return pickUnique([
    `${c.name} won't quite meet your eyes — ${fear} is written all over the way they hold themselves.`,
    `${c.name} starts to say something, stops, and does the small brave thing instead: they stay.`,
    `You catch ${c.name} mid-gesture, caught between the person everyone sees and the one who ${dream}.`,
    `Something shifts in ${c.name}. For a second the mask slips, and you see exactly how much it costs them to be here.`,
    `${c.name} reaches for the easy joke, the easy exit — and, looking at you, chooses neither.`,
    `${c.name}'s hands give them away, the way hands always do, long before the words come.`,
    `${c.name} takes the long way to the point, circling it like ${fear} might bite.`,
    `For a moment ${c.name} just looks at you, deciding how much of the truth you can be trusted with.`,
  ], rng, used);
}

function narration(env: Environment, mood: Emotion, motif: string, world: GeneratedWorld, rng: Rng, used: Set<string>): string {
  const place = env.replaceAll('_', ' ');
  const M = motif[0].toUpperCase() + motif.slice(1);
  const weather: Record<string, string[]> = {
    happy: [`The ${place} feels, for once, like it belongs to all of you.`, `Light pools across the ${place} and nobody's in a hurry to leave.`, `For once the ${place} isn't a place you're waiting to leave.`],
    joyful: [`For a little while the ${place} is loud with the good kind of noise.`, `Whatever's coming, the ${place} holds this one bright hour first.`, `The ${place} fills up with the kind of laughter you'll miss later.`],
    sad: [`The ${place} is quieter than it should be. ${M} sits between you like a third person.`, `Something has thinned in the air of the ${place}, the way it does before a goodbye.`, `The ${place} keeps the shape of everyone who isn't here.`],
    crying: [`The ${place} blurs at the edges. ${M} again — always ${motif}.`, `Nobody in the ${place} knows what to say, so nobody says anything.`, `The ${place} goes soft and underwater, the way grief makes rooms.`],
    angry: [`The ${place} goes taut — the kind of silence louder than shouting.`, `Whatever was holding the ${place} together has started, audibly, to give.`, `The air in the ${place} has teeth now.`],
    afraid: [`The ${place} feels wrong in a way you can't name yet.`, `Dread moves through the ${place} like a draft under a door.`, `The ${place} is too still, the way the world goes before bad news.`],
    neutral: [`${world.title} is exactly as you left it, and somehow not.`, `You find the ${place} half-full and entirely familiar now.`, `The ${place} has started to feel like somewhere you belong.`],
    nervous: [`The ${place} holds its breath with you.`, `Everyone in the ${place} is pretending not to wait for something.`, `The ${place} hums with the particular quiet of things unsaid.`],
  };
  return pickUnique(weather[mood] ?? weather.neutral, rng, used);
}

function makeChoice(speaker: GeneratedCharacter, mood: Emotion, rng: Rng, used: Set<string>) {
  const heavy = mood === 'sad' || mood === 'crying' || mood === 'hurt' || mood === 'afraid' || mood === 'angry';
  const prompt = pickUnique([
    `${speaker.name} waits. Whatever you say next will matter more than usual.`,
    `${speaker.name} is watching you now, really watching. The silence is yours to fill.`,
    `There's a fork in the moment, and ${speaker.name} is leaving the choosing to you.`,
    `You could say anything right now. ${speaker.name} would remember which thing you picked.`,
  ], rng, used);
  return {
    speaker: null as string | null,
    text: prompt,
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
  const motif = world.motifs[index % world.motifs.length] ?? rng.pick(world.motifs);
  const sceneCount = rng.int(3, 4);
  // Two choice points across the chapter (first and a later scene).
  const choiceScenes = new Set<number>([0, Math.min(sceneCount - 1, 2)]);

  // Per-chapter de-dup sets so no narration / line / action repeats in a chapter.
  const usedLines = new Set<string>();
  const usedNarr = new Set<string>();
  const usedAction = new Set<string>();
  const usedTurn = new Set<string>();
  const usedClose = new Set<string>();
  const usedPrompt = new Set<string>();

  const scenes: GenScene[] = [];
  let nodeSeq = 0;
  const nid = () => `ch${index}_n${nodeSeq++}`;

  for (let s = 0; s < sceneCount; s++) {
    const env = world.environments[(index * 2 + s) % world.environments.length];
    const timeOfDay = TIMES[(index + s) % TIMES.length];
    const pair = rng.shuffle([lead.id, second.id]);
    const present = s === 1 ? [pair[0]] : pair.slice(0, rng.int(1, 2));
    const speaker = charById(world, present[0]) ?? lead;
    const other = present[1] ? charById(world, present[1]) : null;
    const mood = moodEmotion(beat.emotionalGoal, rng.fork(`m${s}`));
    const nodes: GenNode[] = [];
    const push = (speakerId: string | null, text: string, emotion?: Emotion) =>
      nodes.push({ id: nid(), speaker: speakerId, text, emotion });

    push(null, narration(env, mood, motif, world, rng.fork(`n${s}`), usedNarr));
    push(null, actionBeat(speaker, rng.fork(`a${s}`), usedAction));
    push(speaker.id, characterLine(speaker, mood, mc, motif, rng.fork(`l${s}a`), usedLines), mood);
    if (other) {
      const om = moodEmotion(beat.emotionalGoal, rng.fork(`o${s}m`));
      push(other.id, characterLine(other, om, mc, motif, rng.fork(`o${s}l`), usedLines), om);
    }
    push(speaker.id, characterLine(speaker, mood, mc, motif, rng.fork(`l${s}b`), usedLines), mood);

    if (choiceScenes.has(s)) {
      const ch = makeChoice(speaker, mood, rng.fork(`p${s}`), usedPrompt);
      nodes.push({ id: nid(), speaker: ch.speaker, text: ch.text, choices: ch.choices });
      push(speaker.id, characterLine(speaker, mood, mc, motif, rng.fork(`l${s}r`), usedLines), mood);
    }

    push(null, pickUnique([
      `The conversation tips somewhere neither of you planned.`,
      `Something in the room rearranges itself, quietly, for good.`,
      `You feel this turning under your hands, becoming a thing you'll keep.`,
      `Whatever you both walked in carrying, it's heavier now — or lighter. Hard to tell yet.`,
      `A line gets crossed that you can't quite uncross.`,
    ], rng.fork(`t${s}`), usedTurn));
    const cm = moodEmotion(beat.emotionalGoal, rng.fork(`c${s}m`));
    push(speaker.id, characterLine(speaker, cm, mc, motif, rng.fork(`l${s}c`), usedLines), cm);
    if (other) push(other.id, characterLine(other, mood, mc, motif, rng.fork(`o${s}2`), usedLines), mood);

    push(null, pickUnique([
      `You let the moment land. Some things you only get to feel once.`,
      `Later you'll replay this. You already know it.`,
      `It settles into your chest and stays.`,
      `Whatever happens next, this is now part of the story you share.`,
      `You'll carry this one out of the room with you.`,
      `Neither of you says it, but you both know something changed.`,
    ], rng.fork(`z${s}`), usedClose));

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
