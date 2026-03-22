/**
 * Outcast — Daily Puzzle
 * Five rounds. Five items each. Four belong. One doesn't. Spot the outcast.
 */

import { createSeededRng, getDateSeed, seededShuffle } from './seed';

export interface OutcastItem {
    name: string;
    emoji: string;
    isOutcast: boolean;
}

export interface OutcastRound {
    roundNumber: number;
    items: Omit<OutcastItem, 'isOutcast'>[];
    difficulty: 'easy' | 'medium' | 'hard' | 'expert' | 'nightmare';
    /** Hidden until answered */
    _solution: {
        outcastName: string;
        trait: string;
        redHerring: string;
    };
}

export interface OutcastPuzzle {
    rounds: OutcastRound[];
}

interface OutcastTemplate {
    items: OutcastItem[];
    trait: string;
    redHerring: string;
    difficulty: 'easy' | 'medium' | 'hard' | 'expert' | 'nightmare';
    tags: string[];
}

/* ────────────────────────────────────────────
 *  EASY — Common, well-known shared traits
 * ──────────────────────────────────────────── */
const EASY_POOL: OutcastTemplate[] = [
    {
        items: [
            { name: 'Piano', emoji: '🎹', isOutcast: false },
            { name: 'Guitar', emoji: '🎸', isOutcast: false },
            { name: 'Violin', emoji: '🎻', isOutcast: false },
            { name: 'Drums', emoji: '🥁', isOutcast: true },
            { name: 'Harp', emoji: '🎵', isOutcast: false },
        ],
        trait: 'All have strings',
        redHerring: 'They\'re all musical instruments',
        difficulty: 'easy',
        tags: ['music', 'instruments'],
    },
    {
        items: [
            { name: 'Mercury', emoji: '☿️', isOutcast: false },
            { name: 'Venus', emoji: '♀️', isOutcast: false },
            { name: 'Earth', emoji: '🌍', isOutcast: true },
            { name: 'Mars', emoji: '♂️', isOutcast: false },
            { name: 'Pluto', emoji: '⚪', isOutcast: false },
        ],
        trait: 'All are named after Roman gods',
        redHerring: 'They\'re all in the solar system',
        difficulty: 'easy',
        tags: ['science', 'astronomy'],
    },
    {
        items: [
            { name: 'Apple', emoji: '🍎', isOutcast: false },
            { name: 'Cherry', emoji: '🍒', isOutcast: false },
            { name: 'Strawberry', emoji: '🍓', isOutcast: false },
            { name: 'Banana', emoji: '🍌', isOutcast: true },
            { name: 'Raspberry', emoji: '🫐', isOutcast: false },
        ],
        trait: 'All are red fruits',
        redHerring: 'They\'re all fruits',
        difficulty: 'easy',
        tags: ['food', 'fruits'],
    },
    {
        items: [
            { name: 'Eagle', emoji: '🦅', isOutcast: false },
            { name: 'Bat', emoji: '🦇', isOutcast: false },
            { name: 'Butterfly', emoji: '🦋', isOutcast: false },
            { name: 'Penguin', emoji: '🐧', isOutcast: true },
            { name: 'Parrot', emoji: '🦜', isOutcast: false },
        ],
        trait: 'All can fly',
        redHerring: 'They\'re all animals with wings',
        difficulty: 'easy',
        tags: ['animals', 'flight'],
    },
    {
        items: [
            { name: 'Lemon', emoji: '🍋', isOutcast: false },
            { name: 'Orange', emoji: '🍊', isOutcast: false },
            { name: 'Lime', emoji: '🟢', isOutcast: false },
            { name: 'Grapefruit', emoji: '🍊', isOutcast: false },
            { name: 'Pineapple', emoji: '🍍', isOutcast: true },
        ],
        trait: 'All are citrus fruits',
        redHerring: 'They\'re all tropical fruits',
        difficulty: 'easy',
        tags: ['food', 'fruits'],
    },
    {
        items: [
            { name: 'Shark', emoji: '🦈', isOutcast: true },
            { name: 'Goldfish', emoji: '🐟', isOutcast: false },
            { name: 'Salmon', emoji: '🐟', isOutcast: false },
            { name: 'Tuna', emoji: '🐟', isOutcast: false },
            { name: 'Trout', emoji: '🐟', isOutcast: false },
        ],
        trait: 'All are bony fish (have a skeleton made of bone)',
        redHerring: 'They\'re all fish',
        difficulty: 'easy',
        tags: ['animals', 'marine'],
    },
    {
        items: [
            { name: 'Soccer', emoji: '⚽', isOutcast: false },
            { name: 'Basketball', emoji: '🏀', isOutcast: false },
            { name: 'Tennis', emoji: '🎾', isOutcast: false },
            { name: 'Hockey', emoji: '🏒', isOutcast: true },
            { name: 'Volleyball', emoji: '🏐', isOutcast: false },
        ],
        trait: 'All are played with a ball',
        redHerring: 'They\'re all popular sports',
        difficulty: 'easy',
        tags: ['sports'],
    },
    {
        items: [
            { name: 'Dog', emoji: '🐕', isOutcast: false },
            { name: 'Cat', emoji: '🐈', isOutcast: false },
            { name: 'Hamster', emoji: '🐹', isOutcast: false },
            { name: 'Goldfish', emoji: '🐟', isOutcast: true },
            { name: 'Rabbit', emoji: '🐇', isOutcast: false },
        ],
        trait: 'All are mammals',
        redHerring: 'They\'re all common household pets',
        difficulty: 'easy',
        tags: ['animals', 'pets'],
    },
    {
        items: [
            { name: 'Diamond', emoji: '💎', isOutcast: false },
            { name: 'Emerald', emoji: '💚', isOutcast: false },
            { name: 'Ruby', emoji: '❤️', isOutcast: false },
            { name: 'Pearl', emoji: '⚪', isOutcast: true },
            { name: 'Sapphire', emoji: '💙', isOutcast: false },
        ],
        trait: 'All are minerals (formed from rock)',
        redHerring: 'They\'re all precious gemstones',
        difficulty: 'easy',
        tags: ['science', 'geology'],
    },
    {
        items: [
            { name: 'Circle', emoji: '⭕', isOutcast: true },
            { name: 'Triangle', emoji: '🔺', isOutcast: false },
            { name: 'Square', emoji: '🟥', isOutcast: false },
            { name: 'Pentagon', emoji: '⬠', isOutcast: false },
            { name: 'Hexagon', emoji: '⬡', isOutcast: false },
        ],
        trait: 'All are polygons (have straight sides)',
        redHerring: 'They\'re all geometric shapes',
        difficulty: 'easy',
        tags: ['math', 'geometry'],
    },
];

/* ────────────────────────────────────────────
 *  MEDIUM — Requires a bit more thought
 * ──────────────────────────────────────────── */
const MEDIUM_POOL: OutcastTemplate[] = [
    {
        items: [
            { name: 'France', emoji: '🇫🇷', isOutcast: false },
            { name: 'Italy', emoji: '🇮🇹', isOutcast: false },
            { name: 'Germany', emoji: '🇩🇪', isOutcast: true },
            { name: 'Ireland', emoji: '🇮🇪', isOutcast: false },
            { name: 'Mexico', emoji: '🇲🇽', isOutcast: false },
        ],
        trait: 'All have flags with vertical stripes',
        redHerring: 'They\'re all countries',
        difficulty: 'medium',
        tags: ['geography', 'flags'],
    },
    {
        items: [
            { name: 'Tiger', emoji: '🐯', isOutcast: false },
            { name: 'Lion', emoji: '🦁', isOutcast: true },
            { name: 'Zebra', emoji: '🦓', isOutcast: false },
            { name: 'Bee', emoji: '🐝', isOutcast: false },
            { name: 'Clownfish', emoji: '🐠', isOutcast: false },
        ],
        trait: 'All have stripes',
        redHerring: 'They\'re all animals',
        difficulty: 'medium',
        tags: ['animals', 'patterns'],
    },
    {
        items: [
            { name: 'Washington', emoji: '🏛️', isOutcast: false },
            { name: 'Lincoln', emoji: '🎩', isOutcast: false },
            { name: 'Jefferson', emoji: '📜', isOutcast: false },
            { name: 'Roosevelt', emoji: '🤠', isOutcast: true },
            { name: 'Hamilton', emoji: '💵', isOutcast: false },
        ],
        trait: 'All appear on U.S. paper currency',
        redHerring: 'They\'re all famous American leaders',
        difficulty: 'medium',
        tags: ['history', 'money'],
    },
    {
        items: [
            { name: 'Jupiter', emoji: '🟠', isOutcast: false },
            { name: 'Saturn', emoji: '🪐', isOutcast: false },
            { name: 'Uranus', emoji: '🔵', isOutcast: false },
            { name: 'Mars', emoji: '🔴', isOutcast: true },
            { name: 'Neptune', emoji: '🔵', isOutcast: false },
        ],
        trait: 'All have ring systems',
        redHerring: 'They\'re all outer planets',
        difficulty: 'medium',
        tags: ['science', 'astronomy'],
    },
    {
        items: [
            { name: 'Japan', emoji: '🇯🇵', isOutcast: false },
            { name: 'Australia', emoji: '🇦🇺', isOutcast: false },
            { name: 'Iceland', emoji: '🇮🇸', isOutcast: false },
            { name: 'Germany', emoji: '🇩🇪', isOutcast: true },
            { name: 'Madagascar', emoji: '🇲🇬', isOutcast: false },
        ],
        trait: 'All are island nations',
        redHerring: 'They\'re all countries',
        difficulty: 'medium',
        tags: ['geography', 'islands'],
    },
    {
        items: [
            { name: 'Frog', emoji: '🐸', isOutcast: false },
            { name: 'Butterfly', emoji: '🦋', isOutcast: false },
            { name: 'Salamander', emoji: '🦎', isOutcast: false },
            { name: 'Snake', emoji: '🐍', isOutcast: true },
            { name: 'Dragonfly', emoji: '🪰', isOutcast: false },
        ],
        trait: 'All undergo metamorphosis',
        redHerring: 'They\'re all cold-blooded animals',
        difficulty: 'medium',
        tags: ['animals', 'biology'],
    },
    {
        items: [
            { name: 'H₂O', emoji: '💧', isOutcast: false },
            { name: 'CO₂', emoji: '💨', isOutcast: false },
            { name: 'NaCl', emoji: '🧂', isOutcast: true },
            { name: 'NH₃', emoji: '⚗️', isOutcast: false },
            { name: 'CH₄', emoji: '🔥', isOutcast: false },
        ],
        trait: 'All are covalent (molecular) compounds',
        redHerring: 'They\'re all common chemical compounds',
        difficulty: 'medium',
        tags: ['science', 'chemistry'],
    },
    {
        items: [
            { name: 'Tetris', emoji: '🟦', isOutcast: false },
            { name: 'Pac-Man', emoji: '🟡', isOutcast: false },
            { name: 'Minecraft', emoji: '⛏️', isOutcast: true },
            { name: 'Space Invaders', emoji: '👾', isOutcast: false },
            { name: 'Pong', emoji: '🏓', isOutcast: false },
        ],
        trait: 'All are arcade games from the 1970s–80s',
        redHerring: 'They\'re all iconic video games',
        difficulty: 'medium',
        tags: ['games', 'technology'],
    },
    {
        items: [
            { name: 'Cello', emoji: '🎻', isOutcast: false },
            { name: 'Viola', emoji: '🎻', isOutcast: false },
            { name: 'Double Bass', emoji: '🎵', isOutcast: false },
            { name: 'Guitar', emoji: '🎸', isOutcast: true },
            { name: 'Violin', emoji: '🎻', isOutcast: false },
        ],
        trait: 'All are played with a bow',
        redHerring: 'They\'re all string instruments',
        difficulty: 'medium',
        tags: ['music', 'instruments'],
    },
];

/* ────────────────────────────────────────────
 *  HARD — Non-obvious facts, requires knowledge
 * ──────────────────────────────────────────── */
const HARD_POOL: OutcastTemplate[] = [
    {
        items: [
            { name: 'Amazon', emoji: '📦', isOutcast: false },
            { name: 'Apple', emoji: '🍎', isOutcast: false },
            { name: 'Tesla', emoji: '⚡', isOutcast: true },
            { name: 'Alphabet', emoji: '🔤', isOutcast: false },
            { name: 'Meta', emoji: '🔵', isOutcast: false },
        ],
        trait: 'All have names that are common English words',
        redHerring: 'They\'re all big tech companies',
        difficulty: 'hard',
        tags: ['technology', 'business'],
    },
    {
        items: [
            { name: 'Chess', emoji: '♟️', isOutcast: false },
            { name: 'Go', emoji: '⚫', isOutcast: false },
            { name: 'Monopoly', emoji: '🎲', isOutcast: true },
            { name: 'Checkers', emoji: '🔴', isOutcast: false },
            { name: 'Othello', emoji: '⚪', isOutcast: false },
        ],
        trait: 'All are two-player strategy games with no luck element',
        redHerring: 'They\'re all board games',
        difficulty: 'hard',
        tags: ['games', 'strategy'],
    },
    {
        items: [
            { name: 'Tomato', emoji: '🍅', isOutcast: false },
            { name: 'Avocado', emoji: '🥑', isOutcast: false },
            { name: 'Pumpkin', emoji: '🎃', isOutcast: false },
            { name: 'Carrot', emoji: '🥕', isOutcast: true },
            { name: 'Cucumber', emoji: '🥒', isOutcast: false },
        ],
        trait: 'All are botanically fruits (not vegetables)',
        redHerring: 'They\'re all vegetables/produce',
        difficulty: 'hard',
        tags: ['food', 'science'],
    },
    {
        items: [
            { name: 'Knight', emoji: '🔤', isOutcast: false },
            { name: 'Gnome', emoji: '🔤', isOutcast: false },
            { name: 'Psalm', emoji: '🔤', isOutcast: false },
            { name: 'Planet', emoji: '🔤', isOutcast: true },
            { name: 'Wreck', emoji: '🔤', isOutcast: false },
        ],
        trait: 'All have silent first letters',
        redHerring: 'They\'re all common English nouns',
        difficulty: 'hard',
        tags: ['language', 'spelling'],
    },
    {
        items: [
            { name: 'Dolphin', emoji: '🐬', isOutcast: false },
            { name: 'Whale', emoji: '🐋', isOutcast: false },
            { name: 'Seal', emoji: '🦭', isOutcast: true },
            { name: 'Porpoise', emoji: '🐬', isOutcast: false },
            { name: 'Orca', emoji: '🐳', isOutcast: false },
        ],
        trait: 'All are cetaceans (order Cetacea)',
        redHerring: 'They\'re all marine mammals',
        difficulty: 'hard',
        tags: ['animals', 'marine'],
    },
    {
        items: [
            { name: 'Brazil', emoji: '🇧🇷', isOutcast: false },
            { name: 'Portugal', emoji: '🇵🇹', isOutcast: false },
            { name: 'Angola', emoji: '🇦🇴', isOutcast: false },
            { name: 'Argentina', emoji: '🇦🇷', isOutcast: true },
            { name: 'Mozambique', emoji: '🇲🇿', isOutcast: false },
        ],
        trait: 'All are Portuguese-speaking countries',
        redHerring: 'They\'re all countries in the Southern Hemisphere',
        difficulty: 'hard',
        tags: ['geography', 'language'],
    },
    {
        items: [
            { name: 'Hydrogen', emoji: '💨', isOutcast: false },
            { name: 'Nitrogen', emoji: '💨', isOutcast: false },
            { name: 'Oxygen', emoji: '💨', isOutcast: false },
            { name: 'Carbon', emoji: '⚫', isOutcast: true },
            { name: 'Fluorine', emoji: '💨', isOutcast: false },
        ],
        trait: 'All are diatomic molecules in their natural state',
        redHerring: 'They\'re all nonmetal elements',
        difficulty: 'hard',
        tags: ['science', 'chemistry'],
    },
    {
        items: [
            { name: 'Rome', emoji: '🏛️', isOutcast: false },
            { name: 'Athens', emoji: '🏛️', isOutcast: false },
            { name: 'Tokyo', emoji: '🗼', isOutcast: false },
            { name: 'Dubai', emoji: '🏙️', isOutcast: true },
            { name: 'Beijing', emoji: '🏯', isOutcast: false },
        ],
        trait: 'All have hosted the Summer Olympics',
        redHerring: 'They\'re all famous world cities',
        difficulty: 'hard',
        tags: ['geography', 'sports'],
    },
    {
        items: [
            { name: 'Raven', emoji: '🐦‍⬛', isOutcast: false },
            { name: 'Crow', emoji: '🐦‍⬛', isOutcast: false },
            { name: 'Jay', emoji: '🐦', isOutcast: false },
            { name: 'Sparrow', emoji: '🐦', isOutcast: true },
            { name: 'Magpie', emoji: '🐦', isOutcast: false },
        ],
        trait: 'All are corvids (family Corvidae)',
        redHerring: 'They\'re all common birds',
        difficulty: 'hard',
        tags: ['animals', 'birds'],
    },
];

/* ────────────────────────────────────────────
 *  EXPERT — Specialized knowledge required
 * ──────────────────────────────────────────── */
const EXPERT_POOL: OutcastTemplate[] = [
    {
        items: [
            { name: 'Peanut', emoji: '🥜', isOutcast: true },
            { name: 'Almond', emoji: '🌰', isOutcast: false },
            { name: 'Walnut', emoji: '🌰', isOutcast: false },
            { name: 'Cashew', emoji: '🥜', isOutcast: false },
            { name: 'Pistachio', emoji: '🟢', isOutcast: false },
        ],
        trait: 'All grow on trees (tree nuts)',
        redHerring: 'They\'re all nuts',
        difficulty: 'expert',
        tags: ['food', 'botany'],
    },
    {
        items: [
            { name: 'Swan Lake', emoji: '🦢', isOutcast: false },
            { name: 'The Nutcracker', emoji: '🎄', isOutcast: false },
            { name: 'Phantom of the Opera', emoji: '🎭', isOutcast: true },
            { name: 'Sleeping Beauty', emoji: '👸', isOutcast: false },
            { name: 'Don Quixote', emoji: '🗡️', isOutcast: false },
        ],
        trait: 'All are famous ballets',
        redHerring: 'They\'re all stage performances',
        difficulty: 'expert',
        tags: ['art', 'dance'],
    },
    {
        items: [
            { name: 'K', emoji: '🔤', isOutcast: false },
            { name: 'W', emoji: '🔤', isOutcast: true },
            { name: 'Z', emoji: '🔤', isOutcast: false },
            { name: 'J', emoji: '🔤', isOutcast: false },
            { name: 'Q', emoji: '🔤', isOutcast: false },
        ],
        trait: 'All are worth 10 points in Scrabble',
        redHerring: 'They\'re all uncommon consonants',
        difficulty: 'expert',
        tags: ['games', 'language'],
    },
    {
        items: [
            { name: 'Rust', emoji: '⚙️', isOutcast: false },
            { name: 'Go', emoji: '🐹', isOutcast: false },
            { name: 'Python', emoji: '🐍', isOutcast: true },
            { name: 'Swift', emoji: '🐦', isOutcast: false },
            { name: 'Kotlin', emoji: '🟣', isOutcast: false },
        ],
        trait: 'All are statically typed programming languages',
        redHerring: 'They\'re all modern programming languages',
        difficulty: 'expert',
        tags: ['technology', 'programming'],
    },
    {
        items: [
            { name: 'Greenland', emoji: '🇬🇱', isOutcast: false },
            { name: 'Borneo', emoji: '🏝️', isOutcast: false },
            { name: 'Madagascar', emoji: '🇲🇬', isOutcast: false },
            { name: 'Australia', emoji: '🇦🇺', isOutcast: true },
            { name: 'New Guinea', emoji: '🏝️', isOutcast: false },
        ],
        trait: 'All are islands (not classified as continents)',
        redHerring: 'They\'re all large landmasses',
        difficulty: 'expert',
        tags: ['geography'],
    },
    {
        items: [
            { name: 'Bat', emoji: '🦇', isOutcast: true },
            { name: 'Hummingbird', emoji: '🐦', isOutcast: false },
            { name: 'Dragonfly', emoji: '🪰', isOutcast: false },
            { name: 'Kestrel', emoji: '🦅', isOutcast: false },
            { name: 'Helicopter', emoji: '🚁', isOutcast: false },
        ],
        trait: 'All can hover in place',
        redHerring: 'They\'re all things that fly',
        difficulty: 'expert',
        tags: ['animals', 'science'],
    },
    {
        items: [
            { name: 'Lead', emoji: '⚫', isOutcast: false },
            { name: 'Mercury', emoji: '🪩', isOutcast: false },
            { name: 'Gold', emoji: '🥇', isOutcast: false },
            { name: 'Iron', emoji: '⚙️', isOutcast: true },
            { name: 'Platinum', emoji: '⚪', isOutcast: false },
        ],
        trait: 'All have chemical symbols that don\'t match their English names',
        redHerring: 'They\'re all heavy metals',
        difficulty: 'expert',
        tags: ['science', 'chemistry'],
    },
    {
        items: [
            { name: 'Titanic', emoji: '🚢', isOutcast: false },
            { name: 'Ben-Hur', emoji: '🏇', isOutcast: false },
            { name: 'Lord of the Rings: Return of the King', emoji: '💍', isOutcast: false },
            { name: 'Inception', emoji: '🌀', isOutcast: true },
            { name: 'The Godfather', emoji: '🎩', isOutcast: false },
        ],
        trait: 'All won the Academy Award for Best Picture',
        redHerring: 'They\'re all critically acclaimed films',
        difficulty: 'expert',
        tags: ['pop culture', 'film'],
    },
    {
        items: [
            { name: 'Banana', emoji: '🍌', isOutcast: false },
            { name: 'Watermelon', emoji: '🍉', isOutcast: false },
            { name: 'Grape', emoji: '🍇', isOutcast: false },
            { name: 'Peach', emoji: '🍑', isOutcast: true },
            { name: 'Pineapple', emoji: '🍍', isOutcast: false },
        ],
        trait: 'All are botanically berries',
        redHerring: 'They\'re all sweet fruits',
        difficulty: 'expert',
        tags: ['food', 'science'],
    },
];

/* ────────────────────────────────────────────
 *  NIGHTMARE — Obscure, counterintuitive traits
 * ──────────────────────────────────────────── */
const NIGHTMARE_POOL: OutcastTemplate[] = [
    {
        items: [
            { name: 'Oxygen', emoji: '💨', isOutcast: true },
            { name: 'Helium', emoji: '🎈', isOutcast: false },
            { name: 'Neon', emoji: '💡', isOutcast: false },
            { name: 'Argon', emoji: '⚡', isOutcast: false },
            { name: 'Krypton', emoji: '🟢', isOutcast: false },
        ],
        trait: 'All are noble gases',
        redHerring: 'They\'re all gaseous elements',
        difficulty: 'nightmare',
        tags: ['science', 'chemistry'],
    },
    {
        items: [
            { name: 'Canberra', emoji: '🇦🇺', isOutcast: false },
            { name: 'Brasília', emoji: '🇧🇷', isOutcast: false },
            { name: 'Istanbul', emoji: '🇹🇷', isOutcast: true },
            { name: 'Ottawa', emoji: '🇨🇦', isOutcast: false },
            { name: 'Washington D.C.', emoji: '🇺🇸', isOutcast: false },
        ],
        trait: 'All are capitals that are NOT the largest city in their country',
        redHerring: 'They\'re all famous cities',
        difficulty: 'nightmare',
        tags: ['geography', 'cities'],
    },
    {
        items: [
            { name: 'QWERTY', emoji: '⌨️', isOutcast: false },
            { name: 'Dvorak', emoji: '⌨️', isOutcast: false },
            { name: 'AZERTY', emoji: '⌨️', isOutcast: false },
            { name: 'WASD', emoji: '🎮', isOutcast: true },
            { name: 'Colemak', emoji: '⌨️', isOutcast: false },
        ],
        trait: 'All are full keyboard layouts',
        redHerring: 'They\'re all keyboard-related terms',
        difficulty: 'nightmare',
        tags: ['technology', 'keyboards'],
    },
    {
        items: [
            { name: 'Dust', emoji: '🔤', isOutcast: false },
            { name: 'Cleave', emoji: '🔤', isOutcast: false },
            { name: 'Sanction', emoji: '🔤', isOutcast: false },
            { name: 'Destroy', emoji: '🔤', isOutcast: true },
            { name: 'Oversight', emoji: '🔤', isOutcast: false },
        ],
        trait: 'All are contronyms (words that are their own antonym)',
        redHerring: 'They\'re all English verbs/nouns',
        difficulty: 'nightmare',
        tags: ['language', 'linguistics'],
    },
    {
        items: [
            { name: 'February', emoji: '📅', isOutcast: false },
            { name: 'Wednesday', emoji: '📅', isOutcast: false },
            { name: 'Colonel', emoji: '🎖️', isOutcast: false },
            { name: 'Beautiful', emoji: '🔤', isOutcast: true },
            { name: 'Queue', emoji: '🔤', isOutcast: false },
        ],
        trait: 'All have letters that are commonly omitted when spoken aloud',
        redHerring: 'They\'re all commonly misspelled English words',
        difficulty: 'nightmare',
        tags: ['language', 'spelling'],
    },
    {
        items: [
            { name: 'Set', emoji: '🔤', isOutcast: false },
            { name: 'Run', emoji: '🔤', isOutcast: false },
            { name: 'Go', emoji: '🔤', isOutcast: false },
            { name: 'Walk', emoji: '🔤', isOutcast: true },
            { name: 'Put', emoji: '🔤', isOutcast: false },
        ],
        trait: 'All have 100+ definitions in the Oxford English Dictionary',
        redHerring: 'They\'re all short common English verbs',
        difficulty: 'nightmare',
        tags: ['language', 'linguistics'],
    },
    {
        items: [
            { name: 'Platypus', emoji: '🦆', isOutcast: false },
            { name: 'Echidna', emoji: '🦔', isOutcast: false },
            { name: 'Armadillo', emoji: '🐾', isOutcast: true },
            { name: 'Western Long-beaked Echidna', emoji: '🦔', isOutcast: false },
            { name: 'Eastern Long-beaked Echidna', emoji: '🦔', isOutcast: false },
        ],
        trait: 'All are monotremes (egg-laying mammals)',
        redHerring: 'They\'re all unusual-looking mammals',
        difficulty: 'nightmare',
        tags: ['animals', 'biology'],
    },
    {
        items: [
            { name: 'Hawaii', emoji: '🇺🇸', isOutcast: false },
            { name: 'Vermont', emoji: '🇺🇸', isOutcast: false },
            { name: 'California', emoji: '🇺🇸', isOutcast: false },
            { name: 'Alaska', emoji: '🇺🇸', isOutcast: true },
            { name: 'Texas', emoji: '🇺🇸', isOutcast: false },
        ],
        trait: 'All were independent republics before becoming U.S. states',
        redHerring: 'They\'re all large or remote U.S. states',
        difficulty: 'nightmare',
        tags: ['geography', 'history'],
    },
    {
        items: [
            { name: 'Twelfth', emoji: '🔤', isOutcast: true },
            { name: 'Rhythm', emoji: '🔤', isOutcast: false },
            { name: 'Myth', emoji: '🔤', isOutcast: false },
            { name: 'Gym', emoji: '🔤', isOutcast: false },
            { name: 'Crypt', emoji: '🔤', isOutcast: false },
        ],
        trait: 'All are English words with no standard vowels (A, E, I, O, U)',
        redHerring: 'They\'re all short English words',
        difficulty: 'nightmare',
        tags: ['language', 'spelling'],
    },
];

const OUTCAST_POOL: OutcastTemplate[][] = [
    EASY_POOL,
    MEDIUM_POOL,
    HARD_POOL,
    EXPERT_POOL,
    NIGHTMARE_POOL,
];

export function generateOutcastPuzzle(date: Date): OutcastPuzzle {
    const seed = getDateSeed(date);
    const rng = createSeededRng(seed * 41 + 17);

    const rounds: OutcastRound[] = [];
    const difficulties: ('easy' | 'medium' | 'hard' | 'expert' | 'nightmare')[] = [
        'easy', 'medium', 'hard', 'expert', 'nightmare',
    ];

    for (let i = 0; i < 5; i++) {
        const pool = OUTCAST_POOL[i];
        // Use date-based offset combined with RNG for better cycling through the pool
        const dayOffset = Math.floor(seed / 100) + seed % 100;
        const rngOffset = Math.floor(rng() * pool.length);
        const idx = (dayOffset + rngOffset) % pool.length;
        const template = pool[idx];
        const outcastName = template.items.find(it => it.isOutcast)!.name;

        rounds.push({
            roundNumber: i + 1,
            items: seededShuffle(
                template.items.map(({ isOutcast: _, ...rest }) => rest),
                rng
            ),
            difficulty: difficulties[i],
            _solution: {
                outcastName,
                trait: template.trait,
                redHerring: template.redHerring,
            },
        });
    }

    return { rounds };
}

export function checkOutcastGuess(round: OutcastRound, guessName: string): boolean {
    return round._solution.outcastName === guessName;
}

export function computeOutcastScore(correctRounds: boolean[]): number {
    const roundPoints = [10, 20, 30, 40, 50];
    let total = 0;
    for (let i = 0; i < 5; i++) {
        if (correctRounds[i]) total += roundPoints[i];
    }
    // Streak bonus: all 5 correct
    if (correctRounds.every(Boolean)) total += 25;
    return total;
}
