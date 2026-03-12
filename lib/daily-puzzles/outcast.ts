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
}

const OUTCAST_POOL: OutcastTemplate[][] = [
    // Easy rounds
    [
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
        },
    ],
    // Medium rounds
    [
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
            redHerring: 'They\'re all former U.S. presidents',
            difficulty: 'medium',
        },
    ],
    // Hard rounds
    [
        {
            items: [
                { name: 'Amazon', emoji: '📦', isOutcast: false },
                { name: 'Apple', emoji: '🍎', isOutcast: false },
                { name: 'Tesla', emoji: '⚡', isOutcast: true },
                { name: 'Alphabet', emoji: '🔤', isOutcast: false },
                { name: 'Meta', emoji: '🔵', isOutcast: false },
            ],
            trait: 'All are in the "Magnificent Seven" AND have an A in their name',
            redHerring: 'They\'re all big tech companies',
            difficulty: 'hard',
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
        },
    ],
    // Expert rounds
    [
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
        },
        {
            items: [
                { name: 'Swan Lake', emoji: '🦢', isOutcast: false },
                { name: 'The Nutcracker', emoji: '🎄', isOutcast: false },
                { name: 'Phantom of the Opera', emoji: '🎭', isOutcast: true },
                { name: 'Sleeping Beauty', emoji: '👸', isOutcast: false },
                { name: 'Don Quixote', emoji: '🗡️', isOutcast: false },
            ],
            trait: 'All are ballets composed by Tchaikovsky or Minkus',
            redHerring: 'They\'re all stage performances',
            difficulty: 'expert',
        },
        {
            items: [
                { name: 'K', emoji: '🔤', isOutcast: false },
                { name: 'W', emoji: '🔤', isOutcast: true },
                { name: 'C', emoji: '🔤', isOutcast: false },
                { name: 'J', emoji: '🔤', isOutcast: false },
                { name: 'Q', emoji: '🔤', isOutcast: false },
            ],
            trait: 'All are worth 10+ points in Scrabble',
            redHerring: 'They\'re all consonants',
            difficulty: 'expert',
        },
    ],
    // Nightmare rounds
    [
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
            redHerring: 'They\'re all capital cities',
            difficulty: 'nightmare',
        },
        {
            items: [
                { name: 'QWERTY', emoji: '⌨️', isOutcast: false },
                { name: 'DVORAK', emoji: '⌨️', isOutcast: false },
                { name: 'AZERTY', emoji: '⌨️', isOutcast: false },
                { name: 'WASD', emoji: '🎮', isOutcast: true },
                { name: 'Colemak', emoji: '⌨️', isOutcast: false },
            ],
            trait: 'All are keyboard layouts',
            redHerring: 'They\'re all keyboard-related terms',
            difficulty: 'nightmare',
        },
    ],
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
        const idx = Math.floor(rng() * pool.length);
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
