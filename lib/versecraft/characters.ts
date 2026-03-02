import type { Character } from './types';

export const CHARACTERS: Record<string, Character> = {
  luna: {
    id: 'luna',
    names: {
      feminine: { first: 'Luna', nickname: 'Lune', pronouns: 'she/her' },
      masculine: { first: 'Lucius', nickname: 'Lune', pronouns: 'he/him' },
      nonbinary: { first: 'Luna', nickname: 'Lune', pronouns: 'they/them' },
    },
    surname: 'Voss',
    defaultPresentation: 'feminine',
    age: 19,
    role: 'Vice President',
    poeticSchool: 'Romanticism / Gothic Poetry',
    archetype: 'The Wounded Healer',
    color: '#4A3B6B',
    accentColor: '#9B8EC4',
    preferences: {
      darkness: 0.85, brightness: 0.2, complexity: 0.75, simplicity: 0.15,
      nature: 0.9, urban: 0.1, abstract: 0.6, concrete: 0.7,
      rhyme: 0.7, freeVerse: 0.3, emotionIntensity: 0.9, restraint: 0.1,
      humor: 0.1, sincerity: 0.85, brevity: 0.3, length: 0.8,
    },
    lovedWordCategories: ['night', 'death', 'flowers', 'rain', 'solitude', 'ocean', 'moonlight', 'sorrow', 'eternity', 'whisper'],
    hatedWordCategories: ['technology', 'business', 'sports', 'mundane', 'cheerful_slang'],
    background: "Lost {{char.pronoun.possessive}} mother — a published poet — at age 14. Inherited {{char.pronoun.possessive}} mother's journal of unfinished poems and joined the society to find the words {{char.pronoun.possessive}} mother never could.",
    secret: "Has been finishing {{char.pronoun.possessive}} mother's poems and submitting them to literary magazines under {{char.pronoun.possessive}} mother's name.",
    fear: 'That {{char.pronoun.subject}} has no original voice — only an echo.',
    dream: 'To write one poem entirely {{char.pronoun.possessive}} own that makes someone feel understood.',
    unlockCondition: 'Available from Act 1',
    signaturePoem: 'The moon does not create the tide — / it merely calls to what was always restless. / I am the ocean, not the shore. / Do not mistake my stillness for peace.',
    expressions: ['neutral', 'melancholy', 'tender_smile', 'tearful', 'passionate', 'angry', 'surprised', 'contemplative', 'blushing', 'broken'],
  },

  kai: {
    id: 'kai',
    names: {
      feminine: { first: 'Kai', nickname: 'K', pronouns: 'she/her' },
      masculine: { first: 'Kai', nickname: 'K', pronouns: 'he/him' },
      nonbinary: { first: 'Kai', nickname: 'K', pronouns: 'they/them' },
    },
    surname: 'Nakamura',
    defaultPresentation: 'nonbinary',
    age: 20,
    role: 'Resident Contrarian / Unofficial Critic',
    poeticSchool: 'Dadaism / L=A=N=G=U=A=G=E Poetry',
    archetype: 'The Trickster',
    color: '#FF4D4D',
    accentColor: '#FFB347',
    preferences: {
      darkness: 0.5, brightness: 0.5, complexity: 0.9, simplicity: 0.05,
      nature: 0.2, urban: 0.8, abstract: 0.95, concrete: 0.3,
      rhyme: 0.1, freeVerse: 0.95, emotionIntensity: 0.4, restraint: 0.3,
      humor: 0.85, sincerity: 0.2, brevity: 0.7, length: 0.3,
    },
    lovedWordCategories: ['absurdist', 'technical_jargon', 'contradictions', 'sounds', 'fragments', 'meta', 'invented', 'colloquial', 'numbers'],
    hatedWordCategories: ['cliche_romantic', 'greeting_card', 'conventional_beauty', 'pastoral_simple'],
    background: 'A transfer student expelled from art school for a "poetry installation" that covered the dean\'s car in magnetic poetry tiles.',
    secret: 'Their most private poems — hidden in encrypted files — are devastatingly sincere love poems they\'ll never show anyone.',
    fear: 'Being ordinary. Being understood too easily. Being predictable.',
    dream: 'To create something that has never existed before in any language.',
    unlockCondition: 'Available from Act 1',
    signaturePoem: 'the the the / (a poem about articles) / definite: the / indefinite: a / zero article: ∅ / —which one am I to you?',
    expressions: ['smirk', 'manic_grin', 'deadpan', 'annoyed', 'vulnerable', 'laughing', 'intense', 'dismissive', 'surprised', 'genuine_smile'],
  },

  rowan: {
    id: 'rowan',
    names: {
      feminine: { first: 'Rowan', nickname: 'Row', pronouns: 'she/her' },
      masculine: { first: 'Rowan', nickname: 'Row', pronouns: 'he/him' },
      nonbinary: { first: 'Rowan', nickname: 'Row', pronouns: 'they/them' },
    },
    surname: 'Hart',
    defaultPresentation: 'masculine',
    age: 18,
    role: 'Secretary / Garden Keeper',
    poeticSchool: 'Haiku / Imagism / Pastoral Poetry',
    archetype: 'The Innocent / The Sage',
    color: '#5B8C5A',
    accentColor: '#A8D8A0',
    preferences: {
      darkness: 0.15, brightness: 0.85, complexity: 0.3, simplicity: 0.9,
      nature: 0.99, urban: 0.05, abstract: 0.2, concrete: 0.95,
      rhyme: 0.4, freeVerse: 0.6, emotionIntensity: 0.3, restraint: 0.9,
      humor: 0.3, sincerity: 0.9, brevity: 0.95, length: 0.1,
    },
    lovedWordCategories: ['seasons', 'animals', 'plants', 'weather', 'water', 'earth', 'silence', 'light', 'simplicity', 'warmth'],
    hatedWordCategories: ['violence', 'technology', 'excess', 'artifice', 'pretension'],
    background: 'Grew up on a small farm and speaks with a quiet confidence. Sees poetry as observation — capturing a moment so precisely that the reader experiences it.',
    secret: 'Slowly going deaf due to a genetic condition. His obsession with capturing sensory moments is building a library of the world before silence takes it.',
    fear: 'A world without birdsong. Losing the ability to hear the rhythm of language.',
    dream: 'To write a poem so vivid that reading it is indistinguishable from being there.',
    unlockCondition: 'Available from Act 1',
    signaturePoem: 'morning dew clings / to the blade — balanced there / between fall and flight',
    expressions: ['gentle_smile', 'thoughtful', 'peaceful', 'concerned', 'listening', 'awestruck', 'sad_smile', 'embarrassed', 'determined', 'distant'],
  },

  sable: {
    id: 'sable',
    names: {
      feminine: { first: 'Sable', nickname: 'Sab', pronouns: 'she/her' },
      masculine: { first: 'Sabel', nickname: 'Sab', pronouns: 'he/him' },
      nonbinary: { first: 'Sable', nickname: 'Sab', pronouns: 'they/them' },
    },
    surname: 'Okafor',
    defaultPresentation: 'feminine',
    age: 20,
    role: 'Performance Director / Events Coordinator',
    poeticSchool: 'Spoken Word / Slam Poetry / Protest Poetry',
    archetype: 'The Warrior / The Leader',
    color: '#D4A017',
    accentColor: '#8B4513',
    preferences: {
      darkness: 0.5, brightness: 0.6, complexity: 0.5, simplicity: 0.5,
      nature: 0.3, urban: 0.8, abstract: 0.4, concrete: 0.8,
      rhyme: 0.6, freeVerse: 0.5, emotionIntensity: 0.95, restraint: 0.05,
      humor: 0.5, sincerity: 0.9, brevity: 0.4, length: 0.7,
    },
    lovedWordCategories: ['power', 'identity', 'resistance', 'voice', 'fire', 'rhythm', 'home', 'ancestors', 'justice', 'body'],
    hatedWordCategories: ['passive_voice', 'wishy_washy', 'vague_abstract', 'academic_jargon'],
    background: 'Daughter of Nigerian immigrants and a three-time city slam poetry champion. Poetry isn\'t something you read quietly — it\'s something you PERFORM.',
    secret: 'Has crippling stage fright masked with bravado. Before every performance, physically ill. The fire the audience sees is adrenaline of pure terror transformed.',
    fear: 'Silence after finishing speaking. That her words don\'t actually reach anyone.',
    dream: 'To give a speech that changes someone\'s life the way poetry changed hers.',
    unlockCondition: 'Available from Act 2',
    signaturePoem: 'I am not asking permission to be loud. / My grandmother\'s grandmother sang through chains / and you think a closed door will stop me? / I am the door. / I am the hinge AND the kick.',
    expressions: ['confident', 'passionate', 'fire', 'laughing', 'vulnerable', 'stern', 'proud', 'exhausted', 'nervous_hidden', 'warm'],
  },

  milo: {
    id: 'milo',
    names: {
      feminine: { first: 'Mila', nickname: 'Mi', pronouns: 'she/her' },
      masculine: { first: 'Milo', nickname: 'Mi', pronouns: 'he/him' },
      nonbinary: { first: 'Milo', nickname: 'Mi', pronouns: 'they/them' },
    },
    surname: 'Vance',
    defaultPresentation: 'masculine',
    age: 19,
    role: 'Treasurer / Archivist',
    poeticSchool: 'Formalism / Sonnets / Villanelles / Metrical Poetry',
    archetype: 'The Mentor / The Perfectionist',
    color: '#2C3E6B',
    accentColor: '#7B93C1',
    preferences: {
      darkness: 0.4, brightness: 0.4, complexity: 0.85, simplicity: 0.1,
      nature: 0.5, urban: 0.3, abstract: 0.6, concrete: 0.5,
      rhyme: 0.95, freeVerse: 0.05, emotionIntensity: 0.3, restraint: 0.9,
      humor: 0.4, sincerity: 0.5, brevity: 0.3, length: 0.6,
    },
    lovedWordCategories: ['classical', 'architecture', 'time', 'craft', 'music', 'mathematics', 'legacy', 'precision', 'tradition', 'honor'],
    hatedWordCategories: ['slang', 'informal', 'chaotic', 'random', 'low_register'],
    background: 'A classics minor who memorized Shakespeare\'s complete sonnets by age 15. Believes poetry is a craft with rules, like architecture or music.',
    secret: 'Obsession with rules stems from growing up in a chaotic, unpredictable household. Poetry\'s rules were the first thing that made sense.',
    fear: 'Chaos. Writing something without structure and finding it\'s better than his formal work.',
    dream: 'To write a formal poem so perfect that even Kai has to admit it\'s beautiful.',
    unlockCondition: 'Available from Act 1',
    signaturePoem: 'In fourteen lines I\'ll build a cathedral — / each iamb a stone set square and true, / the volta is the arch that bears the weight / of everything I cannot say to you.',
    expressions: ['composed', 'analytical', 'slight_smile', 'frustrated', 'impressed', 'disapproving', 'focused', 'flustered', 'rare_laugh', 'admiring'],
  },

  wren: {
    id: 'wren',
    names: {
      feminine: { first: 'Wren', nickname: 'Little Bird', pronouns: 'she/her' },
      masculine: { first: 'Wren', nickname: 'Little Bird', pronouns: 'he/him' },
      nonbinary: { first: 'Wren', nickname: 'Little Bird', pronouns: 'they/them' },
    },
    surname: 'Delacroix',
    defaultPresentation: 'nonbinary',
    age: 18,
    role: 'Newest Member (before player) / Illustrator',
    poeticSchool: 'Surrealism / Magical Realism / Dream Poetry',
    archetype: 'The Mystic / The Child',
    color: '#E8A0BF',
    accentColor: '#FFDAB9',
    preferences: {
      darkness: 0.5, brightness: 0.7, complexity: 0.6, simplicity: 0.4,
      nature: 0.7, urban: 0.3, abstract: 0.9, concrete: 0.5,
      rhyme: 0.3, freeVerse: 0.8, emotionIntensity: 0.6, restraint: 0.3,
      humor: 0.6, sincerity: 0.7, brevity: 0.5, length: 0.5,
    },
    lovedWordCategories: ['dreams', 'colors', 'surreal', 'childhood', 'magic', 'transformation', 'mirrors', 'flight', 'sweetness', 'impossible'],
    hatedWordCategories: ['logic', 'rules', 'bureaucracy', 'bland', 'strict'],
    background: 'An art student who sees poetry and visual art as the same thing expressed through different senses. Speaks in slightly offbeat ways, as though narrating from inside a dream.',
    secret: 'Has maladaptive daydreaming — loses hours to vivid internal worlds. Their surrealist poetry isn\'t a stylistic choice; it\'s a transcription of what they actually experience.',
    fear: 'Waking up one day unable to dream. Or worse — being unable to tell if they\'re dreaming now.',
    dream: 'To create a poem that, when read, makes the reader briefly enter the world of the poem.',
    unlockCondition: 'Available from Act 2',
    signaturePoem: 'the goldfish in my teacup / says the calendar is lying again — / it\'s been Tuesday since the piano / learned to bloom',
    expressions: ['dreamy', 'delighted', 'confused_cute', 'sad', 'inspired', 'giggling', 'spacey', 'focused_rare', 'frightened', 'ethereal'],
  },
};

/** Get character name based on current presentation setting */
export function getCharacterName(characterId: string, presentations: Record<string, string>): string {
  const char = CHARACTERS[characterId];
  if (!char) return characterId;
  const pres = (presentations[characterId] || char.defaultPresentation) as keyof typeof char.names;
  return `${char.names[pres].first} ${char.surname}`;
}

/** Get character first name based on current presentation setting */
export function getCharacterFirstName(characterId: string, presentations: Record<string, string>): string {
  const char = CHARACTERS[characterId];
  if (!char) return characterId;
  const pres = (presentations[characterId] || char.defaultPresentation) as keyof typeof char.names;
  return char.names[pres].first;
}

/** Affinity level thresholds */
export const AFFINITY_LEVELS = [0, 50, 150, 300, 500, 700, 900, 1100, 1300, 1500, 1800];

export function getAffinityLevel(points: number): number {
  for (let i = AFFINITY_LEVELS.length - 1; i >= 0; i--) {
    if (points >= AFFINITY_LEVELS[i]) return i;
  }
  return 0;
}
