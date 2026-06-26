// ─── Generation Banks ─────────────────────────────────────────────────────────
// Curated word/name/trait banks used by the deterministic fallback generator
// (and as grounding hints for the DeepSeek prompts). Kept data-only so both the
// server and client can import without pulling server deps.

import type { Environment } from './world-types';

export interface SettingTemplate {
  id: string;
  /** Keyword hints that bias selection when the player's prompt mentions them. */
  keywords: string[];
  title: string;
  /** {mc} = player name. */
  premise: string;
  setting: string;
  environments: Environment[];
  roles: string[];
  motifs: string[];
  toneTags: string[];
}

export const SETTINGS: SettingTemplate[] = [
  {
    id: 'poetry_society',
    keywords: ['poet', 'poetry', 'writing', 'verse', 'literature', 'words'],
    title: 'The Ivory Quill',
    premise: '{mc}, a college student adrift between majors, follows a stray flyer into a campus poetry society — and finds a circle of people who feel things too loudly for the world outside.',
    setting: 'A small, fiercely close-knit university poetry society that meets in a sun-faded room on the second floor, where everyone is hiding a poem they are too afraid to read aloud.',
    environments: ['club_room', 'classroom', 'cafe', 'school_hallway', 'park', 'personal_room', 'school_stairs'],
    roles: ['the president', 'the rival', 'the quiet one', 'the performer', 'the newcomer', 'the dropout who keeps coming back'],
    motifs: ['unfinished poems', 'a borrowed pen', 'the empty chair', 'rain on the window', 'words left unsaid'],
    toneTags: ['bittersweet', 'tender', 'yearning'],
  },
  {
    id: 'indie_band',
    keywords: ['band', 'music', 'song', 'guitar', 'sing', 'rock', 'gig'],
    title: 'Static & Honey',
    premise: '{mc} answers a flyer for a band missing one member, and a half-broke college garage act becomes the only place their feelings make sense.',
    setting: 'A college indie band that practices in a borrowed club room and plays tiny city venues, holding together by sheer want despite everyone slowly falling apart.',
    environments: ['club_room', 'city', 'cafe', 'personal_room', 'school_gym', 'park'],
    roles: ['the frontperson', 'the perfectionist', 'the drummer who never talks', 'the one who books the gigs', 'the new member'],
    motifs: ['an unfinished song', 'a blown amp', 'the last encore', 'a setlist on a napkin', 'feedback hum'],
    toneTags: ['electric', 'restless', 'bittersweet'],
  },
  {
    id: 'art_collective',
    keywords: ['art', 'paint', 'draw', 'studio', 'design', 'gallery', 'sketch'],
    title: 'The Undercoat',
    premise: '{mc} drifts into a college art collective\'s studio one night and never quite leaves, learning that making something true means letting people see you.',
    setting: 'A scrappy college art collective squatting in an old studio, where paint-stained strangers become the family you choose.',
    environments: ['club_room', 'cafe', 'city', 'park', 'personal_room', 'classroom'],
    roles: ['the founder', 'the sellout-in-progress', 'the purist', 'the muralist', 'the freshman'],
    motifs: ['an unfinished canvas', 'turpentine and coffee', 'the show that might not happen', 'a portrait of you', 'wet paint'],
    toneTags: ['intimate', 'hopeful', 'aching'],
  },
  {
    id: 'study_abroad',
    keywords: ['abroad', 'travel', 'summer', 'exchange', 'trip', 'foreign', 'city'],
    title: 'A Season Elsewhere',
    premise: '{mc} spends a college summer abroad with a handful of strangers, and the borrowed time makes everyone braver — and more breakable.',
    setting: 'A study-abroad summer in a city that isn\'t home, where a small group of students fall into each other\'s orbits knowing it all ends in September.',
    environments: ['city', 'cafe', 'beach', 'park', 'personal_room', 'forest'],
    roles: ['the planner', 'the runaway', 'the homesick one', 'the local', 'the one counting days'],
    motifs: ['a return ticket', 'an unfamiliar language', 'the last week', 'a shared umbrella', 'a city at 3am'],
    toneTags: ['fleeting', 'warm', 'wistful'],
  },
  {
    id: 'drama_troupe',
    keywords: ['theater', 'theatre', 'drama', 'play', 'act', 'stage', 'perform'],
    title: 'Curtain Call',
    premise: '{mc} gets pulled into a college drama troupe mounting one impossible production, where everyone is more honest in costume than out of it.',
    setting: 'A college drama troupe rehearsing a show that keeps threatening to collapse, where the line between the role and the real feeling keeps blurring.',
    environments: ['school_gym', 'club_room', 'classroom', 'cafe', 'school_stairs', 'personal_room'],
    roles: ['the director', 'the lead', 'the understudy', 'the stage manager', 'the newcomer'],
    motifs: ['a missed cue', 'the ghost light', 'opening night', 'a torn script', 'the dark before the curtain'],
    toneTags: ['dramatic', 'raw', 'bittersweet'],
  },
];

export const NAMES: Record<'feminine' | 'masculine' | 'neutral', string[]> = {
  feminine: ['Mara', 'Iris', 'Suki', 'Noor', 'Lena', 'Cleo', 'Yuki', 'Priya', 'Esme', 'Talia', 'Juno', 'Mei', 'Saoirse', 'Vera'],
  masculine: ['Theo', 'Kit', 'Dov', 'Ravi', 'Soren', 'Eli', 'Renzo', 'Hugo', 'Jun', 'Cass', 'Idris', 'Milo', 'Arlo', 'Nico'],
  neutral: ['Ari', 'Wren', 'Sol', 'Kai', 'Rin', 'Ezra', 'Lev', 'Bex', 'Sage', 'Remy', 'Onyx', 'Vesper', 'Hale', 'Marlow'],
};

export const SURNAMES = [
  'Voss', 'Okafor', 'Nakamura', 'Hart', 'Vance', 'Delacroix', 'Reyes', 'Sato',
  'Adeyemi', 'Kovač', 'Bianchi', 'Halloran', 'Mendez', 'Park', 'Ferreira', 'Asghar',
];

export const ARCHETYPES = [
  { name: 'The Wounded Healer', personality: 'gentle and perceptive, carrying a grief they tend like a garden', emotionalDefault: 'sad' },
  { name: 'The Trickster', personality: 'sharp, allergic to sincerity, hiding tenderness behind a joke', emotionalDefault: 'smirk' },
  { name: 'The Quiet Observer', personality: 'soft-spoken and exact, noticing everything and saying little', emotionalDefault: 'thoughtful' },
  { name: 'The Performer', personality: 'loud, magnetic, and secretly terrified of the silence after the applause', emotionalDefault: 'confident' },
  { name: 'The Perfectionist', personality: 'precise and demanding, terrified of the mess underneath their control', emotionalDefault: 'annoyed' },
  { name: 'The Dreamer', personality: 'drifting and luminous, half-living in a world only they can see', emotionalDefault: 'joyful' },
  { name: 'The Loyal One', personality: 'steady and warm, the one who stays — until staying costs too much', emotionalDefault: 'happy' },
  { name: 'The Runaway', personality: 'restless and guarded, always halfway out the door', emotionalDefault: 'nervous' },
] as const;

export const SECRETS = [
  'is quietly failing the thing everyone assumes they\'re best at',
  'is in love with someone they can never tell',
  'is the only one who knows the group is about to fall apart',
  'has been lying about why they really joined',
  'is carrying a diagnosis they haven\'t said out loud',
  'is here to escape a home they can\'t go back to',
  'already gave up once — the dangerous kind of gave up — and is terrified of doing it again',
  'is finishing the work of someone they lost to suicide',
  'is barely holding on after the death of the person who raised them',
  'is the family member nobody talks about — the one who was institutionalized',
  'is using the group to outrun an addiction that is winning',
  'survived something they\'ve never told a living soul, and it lives in everything they make',
];

export const FEARS = [
  'being truly seen and found ordinary',
  'being left behind when everyone moves on',
  'that they peaked already',
  'silence — the kind that means no one\'s coming back',
  'becoming the person who hurt them',
  'that they\'re only ever a supporting character in someone else\'s story',
  'that the darkness they keep at bay will win the next time it comes',
  'that they are fundamentally, unlovably broken',
  'waking up one day having become their parent',
];

export const DREAMS = [
  'to make one thing that outlives them',
  'to be chosen, just once, first',
  'to go home different than they left',
  'to say the true thing before it\'s too late',
  'to keep this fragile, perfect group together',
  'to forgive someone — maybe themselves',
];

export const SPEECH_STYLES = [
  'speaks in short, careful sentences, like each word costs something',
  'talks fast and bright, deflecting with humor',
  'is blunt to the point of rudeness, then softens too late',
  'speaks in warm, looping tangents that always circle back to you',
  'is formal and precise, betraying feeling only in pauses',
  'half-mumbles, trailing off, letting you fill in the rest',
];
