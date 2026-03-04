import type { ChapterData, WordSelectPuzzleData, Scene } from '../types';

export const CHAPTER_1: ChapterData = {
  id: 'ch01',
  actNumber: 1,
  chapterNumber: 1,
  title: 'The Society of Inkstained Fingers',
  subtitle: 'Act 1 — First Draft',
  estimatedPlaytime: 15,
  charactersPresent: ['milo', 'luna', 'kai'],
  scenes: [
    {
      id: 'ch01_s01',
      background: 'school_hallway',
      timeOfDay: 'afternoon',
      bgm: 'afternoon_gold',
      charactersPresent: [],
      dialogueNodes: [
        {
          id: 'ch01_d01',
          speaker: null,
          text: 'The flyer was tucked inside a library book — wedged between pages 42 and 43 of a collection of Neruda, as if someone had left it there on purpose.',
        },
        {
          id: 'ch01_d02',
          speaker: null,
          text: '"THE IVORY QUILL SOCIETY seeks new voices. Room 204, Thursdays, 4 PM. Bring a pen and an open mind."',
        },
        {
          id: 'ch01_d03',
          speaker: null,
          text: 'You\'d walked past Room 204 a hundred times. Never thought to open the door.',
        },
        {
          id: 'ch01_d04',
          speaker: null,
          text: 'Until today.',
        },
      ],
    },
    {
      id: 'ch01_s02',
      background: 'club_room',
      timeOfDay: 'afternoon',
      bgm: 'club_room',
      charactersPresent: ['milo'],
      dialogueNodes: [
        {
          id: 'ch01_d05',
          speaker: null,
          text: 'The door creaks. Inside: bookshelves lining every wall, a large oval table, afternoon light spilling gold across scattered papers.',
        },
        {
          id: 'ch01_d06',
          speaker: 'milo',
          expression: 'composed',
          text: 'Ah. You found the flyer.',
          animation: 'enter_left',
        },
        {
          id: 'ch01_d07',
          speaker: 'milo',
          expression: 'slight_smile',
          text: 'I\'m Milo Vance. I placed twenty of those across the library. You\'re the first to actually show up.',
        },
        {
          id: 'ch01_d08',
          speaker: null,
          text: 'He adjusts his fountain pen — silver, expensive-looking — in his breast pocket. His eyes are sharp, assessing.',
          choices: [
            {
              text: '"Lucky book, I guess."',
              type: 'normal',
              effects: { affinity: { milo: 2 }, flags: { player_tone: 'casual' } },
            },
            {
              text: '"Neruda was a good choice for bait."',
              type: 'deep',
              effects: { affinity: { milo: 5 }, flags: { player_tone: 'literary' } },
            },
            {
              text: '"I almost didn\'t come."',
              type: 'friend',
              effects: { affinity: { milo: 1 }, flags: { player_tone: 'honest' } },
            },
          ],
        },
        {
          id: 'ch01_d09',
          speaker: 'milo',
          expression: 'analytical',
          text: 'The Ivory Quill Society. We\'re a literary circle — poetry, mostly. We meet every Thursday to read, write, and argue about what poetry even is.',
        },
        {
          id: 'ch01_d10',
          speaker: 'milo',
          expression: 'composed',
          text: 'There are six of us. Well, five at the moment. We lost a member last semester.',
        },
        {
          id: 'ch01_d11',
          speaker: 'milo',
          expression: 'slight_smile',
          text: 'Hence the flyers. Would you like to sit down? The others should arrive shortly.',
        },
      ],
    },
    {
      id: 'ch01_s03',
      background: 'club_room',
      timeOfDay: 'afternoon',
      bgm: 'club_room',
      charactersPresent: ['milo', 'luna'],
      dialogueNodes: [
        {
          id: 'ch01_d12',
          speaker: null,
          text: 'The door opens again. A figure slips in — dark-haired, moving like smoke, carrying a weathered leather journal pressed against her chest.',
        },
        {
          id: 'ch01_d13',
          speaker: 'luna',
          expression: 'neutral',
          text: '...oh. Someone new.',
          animation: 'enter_right',
        },
        {
          id: 'ch01_d14',
          speaker: 'milo',
          expression: 'composed',
          text: 'Luna, this is our potential new member. They found one of the flyers.',
        },
        {
          id: 'ch01_d15',
          speaker: 'luna',
          expression: 'contemplative',
          text: 'Which book?',
        },
        {
          id: 'ch01_d16',
          speaker: null,
          text: 'She\'s looking at you with an intensity that feels like being read.',
          choices: [
            {
              text: '"Neruda. Twenty Love Poems."',
              type: 'normal',
              effects: { affinity: { luna: 5, milo: 2 } },
            },
            {
              text: '"Does it matter?"',
              type: 'normal',
              effects: { affinity: { luna: -1, milo: 0 } },
            },
            {
              text: '"I don\'t remember the title. But the spine was cracked at my favorite poem."',
              type: 'deep',
              effects: { affinity: { luna: 8 } },
            },
          ],
        },
        {
          id: 'ch01_d17',
          speaker: 'luna',
          expression: 'tender_smile',
          text: 'Luna Voss. Vice President. I handle... the emotional architecture of this place.',
        },
        {
          id: 'ch01_d18',
          speaker: 'milo',
          expression: 'slight_smile',
          text: 'She means she cries when anyone reads a good poem. It\'s actually very useful feedback.',
        },
        {
          id: 'ch01_d19',
          speaker: 'luna',
          expression: 'melancholy',
          text: '...that\'s not entirely inaccurate.',
        },
      ],
    },
    {
      id: 'ch01_s04',
      background: 'club_room',
      timeOfDay: 'afternoon',
      bgm: 'club_room',
      charactersPresent: ['milo', 'luna', 'kai'],
      dialogueNodes: [
        {
          id: 'ch01_d20',
          speaker: null,
          text: 'The door swings open — no knock, no hesitation. A figure strides in with paint-stained fingers and a grin that dares you to comment on it.',
        },
        {
          id: 'ch01_d21',
          speaker: 'kai',
          expression: 'smirk',
          text: 'Fresh meat? Or are we calling them "new voices" this semester?',
          animation: 'enter_left',
        },
        {
          id: 'ch01_d22',
          speaker: 'milo',
          expression: 'disapproving',
          text: 'Kai. Be civil.',
        },
        {
          id: 'ch01_d23',
          speaker: 'kai',
          expression: 'manic_grin',
          text: 'I am EXTREMELY civil. Kai Nakamura. I\'m the one who makes sure this place doesn\'t become a museum.',
        },
        {
          id: 'ch01_d24',
          speaker: 'luna',
          expression: 'neutral',
          text: 'They mean they argue with everyone.',
        },
        {
          id: 'ch01_d25',
          speaker: 'kai',
          expression: 'smirk',
          text: 'I mean I keep things INTERESTING. Speaking of which —',
        },
        {
          id: 'ch01_d26',
          speaker: 'kai',
          expression: 'intense',
          text: 'New rule. New members write a poem before they sit down. Right now. No prep. No excuses.',
        },
        {
          id: 'ch01_d27',
          speaker: 'milo',
          expression: 'frustrated',
          text: 'Kai, we don\'t —',
        },
        {
          id: 'ch01_d28',
          speaker: 'luna',
          expression: 'contemplative',
          text: '...actually, I want to see it too.',
        },
        {
          id: 'ch01_d29',
          speaker: 'milo',
          expression: 'analytical',
          text: '...fine. But we\'ll make it fair. We\'ll give you some words to choose from. Pick the ones that speak to you, and we\'ll see what kind of poet you are.',
        },
        {
          id: 'ch01_d30',
          speaker: null,
          text: 'Three pairs of eyes fix on you. There\'s no way out of this except through.',
        },
      ],
    },
  ],
  puzzles: [
    {
      type: 'word_select',
      puzzleId: 'ch01_puzzle_first_impression',
    },
  ],
};

/** The first WordSelect puzzle: "First Impressions" */
export const CH01_PUZZLE: WordSelectPuzzleData = {
  id: 'ch01_puzzle_first_impression',
  chapter: 'ch01',
  theme: 'First Impressions',
  promptText: 'Choose 10 words that capture your first impression of this place. What kind of poem lives inside you?',
  requiredWordCount: 10,
  wordPool: [], // Will be populated from WORD_DATABASE at runtime
  bonuses: {
    alliteration: true,
    rhymingPair: true,
    oxymoron: false,
  },
};

/** Post-puzzle dialogue (Scene 5) */
export const CH01_POST_PUZZLE_SCENES: Scene[] = [
  {
    id: 'ch01_s05',
    background: 'club_room',
    timeOfDay: 'afternoon',
    bgm: 'club_room',
    charactersPresent: ['milo', 'luna', 'kai'],
    dialogueNodes: [
      {
        id: 'ch01_d31',
        speaker: null,
        text: 'You arrange the words on the table. The room goes quiet.',
      },
      {
        id: 'ch01_d32',
        speaker: null,
        text: 'Three poets lean in to read.',
      },
    ],
  },
  {
    id: 'ch01_s06',
    background: 'club_room',
    timeOfDay: 'evening',
    bgm: 'club_room_warm',
    charactersPresent: ['milo', 'luna', 'kai'],
    dialogueNodes: [
      {
        id: 'ch01_d33',
        speaker: 'milo',
        expression: 'analytical',
        text: 'Interesting choices. I can see a pattern forming — whether you know it or not.',
      },
      {
        id: 'ch01_d34',
        speaker: 'kai',
        expression: 'smirk',
        text: 'Not bad for someone who claims they "just write sometimes."',
      },
      {
        id: 'ch01_d35',
        speaker: 'luna',
        expression: 'contemplative',
        text: '...there\'s something in there. Something you haven\'t found the words for yet.',
      },
      {
        id: 'ch01_d36',
        speaker: 'luna',
        expression: 'tender_smile',
        text: 'That\'s exactly why you should stay.',
      },
      {
        id: 'ch01_d37',
        speaker: 'milo',
        expression: 'composed',
        text: 'Welcome to the Ivory Quill Society. Meetings are Thursdays at 4. Bring a pen.',
      },
      {
        id: 'ch01_d38',
        speaker: 'kai',
        expression: 'genuine_smile',
        text: 'And an open mind. Or don\'t — closed minds are more fun to crack open.',
      },
      {
        id: 'ch01_d39',
        speaker: null,
        text: 'As you leave Room 204, you realize your hands are shaking. Not from fear. From the feeling of words — your words — having been heard.',
      },
      {
        id: 'ch01_d40',
        speaker: null,
        text: 'Chapter 1 Complete.',
      },
    ],
  },
];
