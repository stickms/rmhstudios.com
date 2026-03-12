/**
 * Spectrum — Daily Puzzle
 * Rank 5 items along a hidden scale. How precisely can you order them?
 */

import { createSeededRng, getDateSeed, seededPick } from './seed';

export interface SpectrumItem {
    name: string;
    emoji: string;
    trueRank: number;
    value: number;
    displayValue: string;
}

export interface SpectrumPuzzle {
    label: string;
    items: Omit<SpectrumItem, 'trueRank' | 'value' | 'displayValue'>[];
    category: string;
    /** Hidden until solved */
    _solution: SpectrumItem[];
    _funFact: string;
}

interface SpectrumSet {
    label: string;
    category: string;
    items: SpectrumItem[];
    funFact: string;
}

const SPECTRUM_POOL: SpectrumSet[] = [
    {
        label: 'Calories per serving: lowest → highest',
        category: 'food',
        items: [
            { name: 'Cucumber (1 cup)', emoji: '🥒', trueRank: 1, value: 16, displayValue: '16 cal' },
            { name: 'Banana', emoji: '🍌', trueRank: 2, value: 105, displayValue: '105 cal' },
            { name: 'Bagel', emoji: '🥯', trueRank: 3, value: 245, displayValue: '245 cal' },
            { name: 'Big Mac', emoji: '🍔', trueRank: 4, value: 550, displayValue: '550 cal' },
            { name: 'Cheesecake slice', emoji: '🍰', trueRank: 5, value: 710, displayValue: '710 cal' },
        ],
        funFact: 'A single slice of cheesecake has more calories than a Big Mac!',
    },
    {
        label: 'Country population: smallest → largest',
        category: 'geography',
        items: [
            { name: 'Iceland', emoji: '🇮🇸', trueRank: 1, value: 376000, displayValue: '376K' },
            { name: 'New Zealand', emoji: '🇳🇿', trueRank: 2, value: 5200000, displayValue: '5.2M' },
            { name: 'Sweden', emoji: '🇸🇪', trueRank: 3, value: 10500000, displayValue: '10.5M' },
            { name: 'Australia', emoji: '🇦🇺', trueRank: 4, value: 26500000, displayValue: '26.5M' },
            { name: 'Canada', emoji: '🇨🇦', trueRank: 5, value: 40000000, displayValue: '40M' },
        ],
        funFact: 'Canada has roughly the same population as California, despite being 25× larger in area.',
    },
    {
        label: 'Year invented: oldest → newest',
        category: 'history',
        items: [
            { name: 'Compass', emoji: '🧭', trueRank: 1, value: 1040, displayValue: '~1040 AD' },
            { name: 'Printing Press', emoji: '🖨️', trueRank: 2, value: 1440, displayValue: '1440' },
            { name: 'Telephone', emoji: '📞', trueRank: 3, value: 1876, displayValue: '1876' },
            { name: 'Television', emoji: '📺', trueRank: 4, value: 1927, displayValue: '1927' },
            { name: 'Internet', emoji: '🌐', trueRank: 5, value: 1983, displayValue: '1983' },
        ],
        funFact: 'The compass was invented in China nearly 1,000 years ago — originally for feng shui, not navigation.',
    },
    {
        label: 'Distance from Earth: closest → farthest',
        category: 'science',
        items: [
            { name: 'The Moon', emoji: '🌙', trueRank: 1, value: 384400, displayValue: '384K km' },
            { name: 'Venus (closest)', emoji: '✨', trueRank: 2, value: 38000000, displayValue: '38M km' },
            { name: 'Mars (closest)', emoji: '🔴', trueRank: 3, value: 55000000, displayValue: '55M km' },
            { name: 'Jupiter (closest)', emoji: '🟤', trueRank: 4, value: 588000000, displayValue: '588M km' },
            { name: 'Pluto (avg)', emoji: '⚪', trueRank: 5, value: 5900000000, displayValue: '5.9B km' },
        ],
        funFact: 'You could fit every planet in the solar system between Earth and the Moon — with room to spare!',
    },
    {
        label: 'Average lifespan: shortest → longest',
        category: 'science',
        items: [
            { name: 'Mayfly', emoji: '🪰', trueRank: 1, value: 0.003, displayValue: '24 hours' },
            { name: 'Hamster', emoji: '🐹', trueRank: 2, value: 2.5, displayValue: '2.5 years' },
            { name: 'Dog', emoji: '🐕', trueRank: 3, value: 12, displayValue: '12 years' },
            { name: 'Human', emoji: '🧑', trueRank: 4, value: 73, displayValue: '73 years' },
            { name: 'Galápagos Tortoise', emoji: '🐢', trueRank: 5, value: 175, displayValue: '175 years' },
        ],
        funFact: 'The oldest known tortoise, Jonathan, is over 190 years old and was born before the photograph was invented.',
    },
    {
        label: 'Top speed: slowest → fastest',
        category: 'science',
        items: [
            { name: 'Garden Snail', emoji: '🐌', trueRank: 1, value: 0.03, displayValue: '0.03 mph' },
            { name: 'Usain Bolt', emoji: '🏃', trueRank: 2, value: 27.8, displayValue: '27.8 mph' },
            { name: 'Cheetah', emoji: '🐆', trueRank: 3, value: 70, displayValue: '70 mph' },
            { name: 'Peregrine Falcon', emoji: '🦅', trueRank: 4, value: 240, displayValue: '240 mph' },
            { name: 'Space Shuttle', emoji: '🚀', trueRank: 5, value: 17500, displayValue: '17,500 mph' },
        ],
        funFact: 'A peregrine falcon in a stoop (dive) is the fastest animal on Earth, reaching over 240 mph.',
    },
    {
        label: 'Oscar wins (film): fewest → most',
        category: 'pop-culture',
        items: [
            { name: 'The Godfather', emoji: '🎬', trueRank: 1, value: 3, displayValue: '3 wins' },
            { name: 'Forrest Gump', emoji: '🏃', trueRank: 2, value: 6, displayValue: '6 wins' },
            { name: 'Schindler\'s List', emoji: '🎞️', trueRank: 3, value: 7, displayValue: '7 wins' },
            { name: 'Titanic', emoji: '🚢', trueRank: 4, value: 11, displayValue: '11 wins' },
            { name: 'Ben-Hur', emoji: '🏛️', trueRank: 5, value: 11, displayValue: '11 wins' },
        ],
        funFact: 'Only three films have ever won 11 Oscars: Ben-Hur, Titanic, and The Lord of the Rings: The Return of the King.',
    },
    {
        label: 'Coffee caffeine content: lowest → highest',
        category: 'food',
        items: [
            { name: 'Decaf coffee', emoji: '☕', trueRank: 1, value: 7, displayValue: '7 mg' },
            { name: 'Green tea', emoji: '🍵', trueRank: 2, value: 28, displayValue: '28 mg' },
            { name: 'Coca-Cola (12 oz)', emoji: '🥤', trueRank: 3, value: 34, displayValue: '34 mg' },
            { name: 'Red Bull (8.4 oz)', emoji: '🐂', trueRank: 4, value: 80, displayValue: '80 mg' },
            { name: 'Espresso shot', emoji: '☕', trueRank: 5, value: 63, displayValue: '63 mg' },
        ],
        funFact: 'Contrary to popular belief, a shot of espresso has less caffeine than a standard cup of drip coffee (95 mg).',
    },
    {
        label: 'Height of structures: shortest → tallest',
        category: 'geography',
        items: [
            { name: 'Statue of Liberty', emoji: '🗽', trueRank: 1, value: 93, displayValue: '93 m' },
            { name: 'Big Ben', emoji: '🕰️', trueRank: 2, value: 96, displayValue: '96 m' },
            { name: 'Eiffel Tower', emoji: '🗼', trueRank: 3, value: 330, displayValue: '330 m' },
            { name: 'Empire State Building', emoji: '🏢', trueRank: 4, value: 443, displayValue: '443 m' },
            { name: 'Burj Khalifa', emoji: '🏗️', trueRank: 5, value: 828, displayValue: '828 m' },
        ],
        funFact: 'The Burj Khalifa is so tall that residents on higher floors can watch the sunset twice — once from their floor, then by taking the elevator down and watching it again.',
    },
    {
        label: 'Twitter/X followers: fewest → most',
        category: 'pop-culture',
        items: [
            { name: 'Oprah', emoji: '📺', trueRank: 1, value: 42000000, displayValue: '42M' },
            { name: 'Taylor Swift', emoji: '🎤', trueRank: 2, value: 95000000, displayValue: '95M' },
            { name: 'Cristiano Ronaldo', emoji: '⚽', trueRank: 3, value: 112000000, displayValue: '112M' },
            { name: 'Barack Obama', emoji: '🇺🇸', trueRank: 4, value: 133000000, displayValue: '133M' },
            { name: 'Elon Musk', emoji: '🚀', trueRank: 5, value: 170000000, displayValue: '170M' },
        ],
        funFact: 'Barack Obama\'s "Four more years" tweet from 2012 was the most retweeted tweet for over three years.',
    },
];

export function generateSpectrumPuzzle(date: Date): SpectrumPuzzle {
    const seed = getDateSeed(date);
    const rng = createSeededRng(seed * 37 + 13);

    const idx = Math.floor(rng() * SPECTRUM_POOL.length);
    const set = SPECTRUM_POOL[idx];

    // Shuffle display order (players need to re-order them)
    const shuffledItems = [...set.items];
    for (let i = shuffledItems.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [shuffledItems[i], shuffledItems[j]] = [shuffledItems[j], shuffledItems[i]];
    }

    return {
        label: set.label,
        items: shuffledItems.map(({ trueRank: _, value: _v, displayValue: _dv, ...rest }) => rest),
        category: set.category,
        _solution: set.items, // sorted by trueRank already
        _funFact: set.funFact,
    };
}

export function scoreSpectrumItem(playerRank: number, trueRank: number): number {
    const diff = Math.abs(playerRank - trueRank);
    if (diff === 0) return 2;
    if (diff === 1) return 1;
    return 0;
}

export function computeSpectrumScore(playerOrder: string[], solution: SpectrumItem[]): {
    accuracy: number;
    points: number;
    itemScores: { name: string; playerRank: number; trueRank: number; score: number }[];
} {
    const itemScores = solution.map(item => {
        const playerRank = playerOrder.indexOf(item.name) + 1;
        const score = scoreSpectrumItem(playerRank, item.trueRank);
        return { name: item.name, playerRank, trueRank: item.trueRank, score };
    });

    const accuracy = itemScores.reduce((sum, s) => sum + s.score, 0);

    let points: number;
    if (accuracy === 10) points = 150;
    else if (accuracy >= 8) points = 100;
    else if (accuracy >= 6) points = 60;
    else if (accuracy >= 4) points = 30;
    else points = 10;

    return { accuracy, points, itemScores };
}
