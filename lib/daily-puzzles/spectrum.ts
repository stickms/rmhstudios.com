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
    tags: string[];
    items: SpectrumItem[];
    funFact: string;
}

const SPECTRUM_POOL: SpectrumSet[] = [
    // ─── FOOD & DRINK ────────────────────────────────────────────────
    {
        label: 'Calories per serving: lowest → highest',
        category: 'food',
        tags: ['food', 'calories'],
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
        label: 'Caffeine content: lowest → highest',
        category: 'food',
        tags: ['food', 'caffeine'],
        items: [
            { name: 'Decaf coffee (8 oz)', emoji: '☕', trueRank: 1, value: 7, displayValue: '7 mg' },
            { name: 'Green tea (8 oz)', emoji: '🍵', trueRank: 2, value: 28, displayValue: '28 mg' },
            { name: 'Coca-Cola (12 oz)', emoji: '🥤', trueRank: 3, value: 34, displayValue: '34 mg' },
            { name: 'Espresso (1 shot)', emoji: '☕', trueRank: 4, value: 63, displayValue: '63 mg' },
            { name: 'Red Bull (8.4 oz)', emoji: '🐂', trueRank: 5, value: 80, displayValue: '80 mg' },
        ],
        funFact: 'A standard 8 oz cup of drip coffee has about 95 mg of caffeine — more than both espresso and Red Bull.',
    },
    {
        label: 'Sugar per serving: lowest → highest',
        category: 'food',
        tags: ['food', 'sugar'],
        items: [
            { name: 'Ketchup (1 tbsp)', emoji: '🍅', trueRank: 1, value: 4, displayValue: '4 g' },
            { name: 'Plain yogurt (6 oz)', emoji: '🥛', trueRank: 2, value: 5, displayValue: '5 g' },
            { name: 'Orange juice (8 oz)', emoji: '🍊', trueRank: 3, value: 21, displayValue: '21 g' },
            { name: 'Coca-Cola (12 oz)', emoji: '🥤', trueRank: 4, value: 39, displayValue: '39 g' },
            { name: 'Cinnabon Classic Roll', emoji: '🧁', trueRank: 5, value: 58, displayValue: '58 g' },
        ],
        funFact: 'A single Cinnabon Classic Roll contains nearly 15 teaspoons of sugar.',
    },
    {
        label: 'Price of a Big Mac (2024): cheapest → most expensive',
        category: 'food',
        tags: ['food', 'prices', 'economics'],
        items: [
            { name: 'India', emoji: '🇮🇳', trueRank: 1, value: 2.33, displayValue: '$2.33' },
            { name: 'China', emoji: '🇨🇳', trueRank: 2, value: 3.57, displayValue: '$3.57' },
            { name: 'United States', emoji: '🇺🇸', trueRank: 3, value: 5.69, displayValue: '$5.69' },
            { name: 'Denmark', emoji: '🇩🇰', trueRank: 4, value: 5.97, displayValue: '$5.97' },
            { name: 'Switzerland', emoji: '🇨🇭', trueRank: 5, value: 7.73, displayValue: '$7.73' },
        ],
        funFact: 'The Big Mac Index was invented by The Economist in 1986 as a lighthearted guide to currency purchasing power.',
    },
    {
        label: 'Scoville heat units: mildest → hottest',
        category: 'food',
        tags: ['food', 'spice'],
        items: [
            { name: 'Bell Pepper', emoji: '🫑', trueRank: 1, value: 0, displayValue: '0 SHU' },
            { name: 'Jalapeño', emoji: '🌶️', trueRank: 2, value: 5000, displayValue: '2,500–8,000 SHU' },
            { name: 'Cayenne Pepper', emoji: '🌶️', trueRank: 3, value: 40000, displayValue: '30,000–50,000 SHU' },
            { name: 'Habanero', emoji: '🔥', trueRank: 4, value: 250000, displayValue: '100,000–350,000 SHU' },
            { name: 'Carolina Reaper', emoji: '💀', trueRank: 5, value: 2200000, displayValue: '2,200,000 SHU' },
        ],
        funFact: 'The Carolina Reaper is roughly 440 times hotter than a jalapeño.',
    },
    // ─── GEOGRAPHY ───────────────────────────────────────────────────
    {
        label: 'Country population: smallest → largest',
        category: 'geography',
        tags: ['geography', 'population'],
        items: [
            { name: 'Iceland', emoji: '🇮🇸', trueRank: 1, value: 376000, displayValue: '376K' },
            { name: 'New Zealand', emoji: '🇳🇿', trueRank: 2, value: 5200000, displayValue: '5.2M' },
            { name: 'Sweden', emoji: '🇸🇪', trueRank: 3, value: 10500000, displayValue: '10.5M' },
            { name: 'Australia', emoji: '🇦🇺', trueRank: 4, value: 26500000, displayValue: '26.5M' },
            { name: 'Canada', emoji: '🇨🇦', trueRank: 5, value: 40000000, displayValue: '40M' },
        ],
        funFact: 'Canada has roughly the same population as California, despite being 25x larger in area.',
    },
    {
        label: 'Country area: smallest → largest',
        category: 'geography',
        tags: ['geography', 'area'],
        items: [
            { name: 'Vatican City', emoji: '🇻🇦', trueRank: 1, value: 0.44, displayValue: '0.44 km²' },
            { name: 'Singapore', emoji: '🇸🇬', trueRank: 2, value: 733, displayValue: '733 km²' },
            { name: 'Jamaica', emoji: '🇯🇲', trueRank: 3, value: 10991, displayValue: '10,991 km²' },
            { name: 'United Kingdom', emoji: '🇬🇧', trueRank: 4, value: 243610, displayValue: '243,610 km²' },
            { name: 'India', emoji: '🇮🇳', trueRank: 5, value: 3287263, displayValue: '3.29M km²' },
        ],
        funFact: 'Vatican City is so small that the entire country could fit inside New York\'s Central Park roughly 8 times.',
    },
    {
        label: 'Height of structures: shortest → tallest',
        category: 'geography',
        tags: ['geography', 'height', 'architecture'],
        items: [
            { name: 'Statue of Liberty', emoji: '🗽', trueRank: 1, value: 93, displayValue: '93 m' },
            { name: 'Big Ben (Elizabeth Tower)', emoji: '🕰️', trueRank: 2, value: 96, displayValue: '96 m' },
            { name: 'Eiffel Tower', emoji: '🗼', trueRank: 3, value: 330, displayValue: '330 m' },
            { name: 'Empire State Building', emoji: '🏢', trueRank: 4, value: 443, displayValue: '443 m' },
            { name: 'Burj Khalifa', emoji: '🏗️', trueRank: 5, value: 828, displayValue: '828 m' },
        ],
        funFact: 'The Statue of Liberty and Big Ben are almost the same height — only 3 meters apart.',
    },
    {
        label: 'Lake surface area: smallest → largest',
        category: 'geography',
        tags: ['geography', 'area', 'water'],
        items: [
            { name: 'Lake Tahoe', emoji: '🏔️', trueRank: 1, value: 496, displayValue: '496 km²' },
            { name: 'Lake Erie', emoji: '🌊', trueRank: 2, value: 25700, displayValue: '25,700 km²' },
            { name: 'Lake Victoria', emoji: '🌍', trueRank: 3, value: 68870, displayValue: '68,870 km²' },
            { name: 'Lake Superior', emoji: '🇺🇸', trueRank: 4, value: 82100, displayValue: '82,100 km²' },
            { name: 'Caspian Sea', emoji: '🌊', trueRank: 5, value: 371000, displayValue: '371,000 km²' },
        ],
        funFact: 'The Caspian Sea is technically a lake and is larger than Germany.',
    },
    {
        label: 'Average elevation: lowest → highest',
        category: 'geography',
        tags: ['geography', 'elevation'],
        items: [
            { name: 'Netherlands', emoji: '🇳🇱', trueRank: 1, value: 30, displayValue: '30 m' },
            { name: 'Australia', emoji: '🇦🇺', trueRank: 2, value: 330, displayValue: '330 m' },
            { name: 'United States', emoji: '🇺🇸', trueRank: 3, value: 760, displayValue: '760 m' },
            { name: 'Ethiopia', emoji: '🇪🇹', trueRank: 4, value: 1330, displayValue: '1,330 m' },
            { name: 'Bhutan', emoji: '🇧🇹', trueRank: 5, value: 3280, displayValue: '3,280 m' },
        ],
        funFact: 'Bhutan\'s average elevation is higher than the summit of most mountains in Europe.',
    },
    // ─── SCIENCE ─────────────────────────────────────────────────────
    {
        label: 'Distance from Earth: closest → farthest',
        category: 'science',
        tags: ['science', 'space', 'distance'],
        items: [
            { name: 'The Moon', emoji: '🌙', trueRank: 1, value: 384400, displayValue: '384K km' },
            { name: 'Venus (closest approach)', emoji: '✨', trueRank: 2, value: 38000000, displayValue: '38M km' },
            { name: 'Mars (closest approach)', emoji: '🔴', trueRank: 3, value: 55000000, displayValue: '55M km' },
            { name: 'Jupiter (closest approach)', emoji: '🟤', trueRank: 4, value: 588000000, displayValue: '588M km' },
            { name: 'Pluto (average)', emoji: '⚪', trueRank: 5, value: 5900000000, displayValue: '5.9B km' },
        ],
        funFact: 'You could fit every planet in the solar system between Earth and the Moon — with room to spare!',
    },
    {
        label: 'Average lifespan: shortest → longest',
        category: 'science',
        tags: ['science', 'biology', 'lifespan'],
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
        tags: ['science', 'speed'],
        items: [
            { name: 'Garden Snail', emoji: '🐌', trueRank: 1, value: 0.03, displayValue: '0.03 mph' },
            { name: 'Usain Bolt', emoji: '🏃', trueRank: 2, value: 27.8, displayValue: '27.8 mph' },
            { name: 'Cheetah', emoji: '🐆', trueRank: 3, value: 70, displayValue: '70 mph' },
            { name: 'Peregrine Falcon (dive)', emoji: '🦅', trueRank: 4, value: 240, displayValue: '240 mph' },
            { name: 'Space Shuttle', emoji: '🚀', trueRank: 5, value: 17500, displayValue: '17,500 mph' },
        ],
        funFact: 'A peregrine falcon in a stoop (dive) is the fastest animal on Earth, reaching over 240 mph.',
    },
    {
        label: 'Density of material: least → most dense',
        category: 'science',
        tags: ['science', 'physics', 'density'],
        items: [
            { name: 'Cork', emoji: '🪵', trueRank: 1, value: 0.12, displayValue: '0.12 g/cm³' },
            { name: 'Ice', emoji: '🧊', trueRank: 2, value: 0.917, displayValue: '0.917 g/cm³' },
            { name: 'Aluminum', emoji: '🔩', trueRank: 3, value: 2.7, displayValue: '2.7 g/cm³' },
            { name: 'Iron', emoji: '⚙️', trueRank: 4, value: 7.87, displayValue: '7.87 g/cm³' },
            { name: 'Gold', emoji: '🥇', trueRank: 5, value: 19.3, displayValue: '19.3 g/cm³' },
        ],
        funFact: 'Ice is less dense than liquid water, which is why it floats — a rare property among materials.',
    },
    {
        label: 'Boiling point: lowest → highest',
        category: 'science',
        tags: ['science', 'chemistry', 'temperature'],
        items: [
            { name: 'Nitrogen', emoji: '💨', trueRank: 1, value: -196, displayValue: '−196 °C' },
            { name: 'Ethanol (alcohol)', emoji: '🍷', trueRank: 2, value: 78, displayValue: '78 °C' },
            { name: 'Water', emoji: '💧', trueRank: 3, value: 100, displayValue: '100 °C' },
            { name: 'Mercury', emoji: '🌡️', trueRank: 4, value: 357, displayValue: '357 °C' },
            { name: 'Iron', emoji: '⚙️', trueRank: 5, value: 2862, displayValue: '2,862 °C' },
        ],
        funFact: 'Alcohol boils at 78°C, which is why you can flambe food and cook off the alcohol while the water stays liquid.',
    },
    // ─── HISTORY ─────────────────────────────────────────────────────
    {
        label: 'Year invented: oldest → newest',
        category: 'history',
        tags: ['history', 'inventions'],
        items: [
            { name: 'Compass', emoji: '🧭', trueRank: 1, value: 1040, displayValue: '~1040 AD' },
            { name: 'Printing Press', emoji: '🖨️', trueRank: 2, value: 1440, displayValue: '1440' },
            { name: 'Telephone', emoji: '📞', trueRank: 3, value: 1876, displayValue: '1876' },
            { name: 'Television', emoji: '📺', trueRank: 4, value: 1927, displayValue: '1927' },
            { name: 'Internet (TCP/IP)', emoji: '🌐', trueRank: 5, value: 1983, displayValue: '1983' },
        ],
        funFact: 'The compass was invented in China nearly 1,000 years ago — originally for feng shui, not navigation.',
    },
    {
        label: 'Age of ancient structures: newest → oldest',
        category: 'history',
        tags: ['history', 'ancient', 'architecture'],
        items: [
            { name: 'Leaning Tower of Pisa', emoji: '🏛️', trueRank: 1, value: 1372, displayValue: 'Completed ~1372' },
            { name: 'Angkor Wat', emoji: '🛕', trueRank: 2, value: 1150, displayValue: 'Completed ~1150' },
            { name: 'Colosseum', emoji: '🏟️', trueRank: 3, value: 80, displayValue: 'Completed 80 AD' },
            { name: 'Great Wall (first sections)', emoji: '🧱', trueRank: 4, value: -700, displayValue: '~7th century BC' },
            { name: 'Great Pyramid of Giza', emoji: '🔺', trueRank: 5, value: -2560, displayValue: '~2560 BC' },
        ],
        funFact: 'Cleopatra lived closer in time to the Moon landing than to the building of the Great Pyramid.',
    },
    {
        label: 'Duration of empire: shortest → longest',
        category: 'history',
        tags: ['history', 'civilizations', 'duration'],
        items: [
            { name: 'Mongol Empire', emoji: '🏇', trueRank: 1, value: 162, displayValue: '~162 years' },
            { name: 'British Empire', emoji: '🇬🇧', trueRank: 2, value: 400, displayValue: '~400 years' },
            { name: 'Ottoman Empire', emoji: '🕌', trueRank: 3, value: 623, displayValue: '623 years' },
            { name: 'Roman Empire (incl. East)', emoji: '🏛️', trueRank: 4, value: 1480, displayValue: '~1,480 years' },
            { name: 'Ancient Egypt', emoji: '🔺', trueRank: 5, value: 3000, displayValue: '~3,000 years' },
        ],
        funFact: 'Ancient Egypt lasted so long that to the ancient Romans, it was already ancient history.',
    },
    {
        label: 'US Presidents: earliest → latest inaugurated',
        category: 'history',
        tags: ['history', 'politics', 'US'],
        items: [
            { name: 'Abraham Lincoln', emoji: '🎩', trueRank: 1, value: 1861, displayValue: '1861' },
            { name: 'Theodore Roosevelt', emoji: '🗻', trueRank: 2, value: 1901, displayValue: '1901' },
            { name: 'Franklin D. Roosevelt', emoji: '🇺🇸', trueRank: 3, value: 1933, displayValue: '1933' },
            { name: 'John F. Kennedy', emoji: '🌙', trueRank: 4, value: 1961, displayValue: '1961' },
            { name: 'Barack Obama', emoji: '🇺🇸', trueRank: 5, value: 2009, displayValue: '2009' },
        ],
        funFact: 'Theodore Roosevelt, at 42, was the youngest person to become US President — not JFK (who was 43).',
    },
    // ─── POP CULTURE ─────────────────────────────────────────────────
    {
        label: 'Oscar wins (film): fewest → most',
        category: 'pop-culture',
        tags: ['pop-culture', 'movies', 'awards'],
        items: [
            { name: 'The Godfather', emoji: '🎬', trueRank: 1, value: 3, displayValue: '3 wins' },
            { name: 'Forrest Gump', emoji: '🏃', trueRank: 2, value: 6, displayValue: '6 wins' },
            { name: 'Schindler\'s List', emoji: '🎞️', trueRank: 3, value: 7, displayValue: '7 wins' },
            { name: 'The Last Emperor', emoji: '👑', trueRank: 4, value: 9, displayValue: '9 wins' },
            { name: 'Ben-Hur', emoji: '🏛️', trueRank: 5, value: 11, displayValue: '11 wins' },
        ],
        funFact: 'Only three films have ever won 11 Oscars: Ben-Hur, Titanic, and The Lord of the Rings: The Return of the King.',
    },
    {
        label: 'Worldwide box office gross: lowest → highest',
        category: 'pop-culture',
        tags: ['pop-culture', 'movies', 'box-office'],
        items: [
            { name: 'Inception', emoji: '💭', trueRank: 1, value: 839, displayValue: '$839M' },
            { name: 'The Dark Knight', emoji: '🦇', trueRank: 2, value: 1006, displayValue: '$1.006B' },
            { name: 'Jurassic World', emoji: '🦖', trueRank: 3, value: 1672, displayValue: '$1.672B' },
            { name: 'Avengers: Endgame', emoji: '🦸', trueRank: 4, value: 2799, displayValue: '$2.799B' },
            { name: 'Avatar (2009)', emoji: '🌊', trueRank: 5, value: 2923, displayValue: '$2.923B' },
        ],
        funFact: 'Avatar reclaimed the #1 all-time box office spot from Endgame after a 2021 re-release in China.',
    },
    {
        label: 'Album sales (worldwide, all-time): fewest → most',
        category: 'pop-culture',
        tags: ['pop-culture', 'music', 'sales'],
        items: [
            { name: 'Adele — 21', emoji: '🎤', trueRank: 1, value: 31, displayValue: '31M copies' },
            { name: 'Eagles — Their Greatest Hits', emoji: '🦅', trueRank: 2, value: 44, displayValue: '44M copies' },
            { name: 'Pink Floyd — The Dark Side of the Moon', emoji: '🌑', trueRank: 3, value: 45, displayValue: '45M copies' },
            { name: 'AC/DC — Back in Black', emoji: '🎸', trueRank: 4, value: 50, displayValue: '50M copies' },
            { name: 'Michael Jackson — Thriller', emoji: '🕺', trueRank: 5, value: 70, displayValue: '70M copies' },
        ],
        funFact: 'Thriller has been certified as the best-selling album of all time at 70 million copies worldwide.',
    },
    {
        label: 'TV show episode count: fewest → most',
        category: 'pop-culture',
        tags: ['pop-culture', 'tv', 'episodes'],
        items: [
            { name: 'Breaking Bad', emoji: '🧪', trueRank: 1, value: 62, displayValue: '62 episodes' },
            { name: 'Game of Thrones', emoji: '⚔️', trueRank: 2, value: 73, displayValue: '73 episodes' },
            { name: 'Friends', emoji: '☕', trueRank: 3, value: 236, displayValue: '236 episodes' },
            { name: 'Gunsmoke', emoji: '🤠', trueRank: 4, value: 635, displayValue: '635 episodes' },
            { name: 'The Simpsons', emoji: '🍩', trueRank: 5, value: 770, displayValue: '770+ episodes' },
        ],
        funFact: 'The Simpsons has been on the air since 1989, making it the longest-running American animated program.',
    },
    // ─── SPORTS ──────────────────────────────────────────────────────
    {
        label: 'FIFA World Cup wins: fewest → most',
        category: 'sports',
        tags: ['sports', 'soccer', 'championships'],
        items: [
            { name: 'England', emoji: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', trueRank: 1, value: 1, displayValue: '1 win' },
            { name: 'France', emoji: '🇫🇷', trueRank: 2, value: 2, displayValue: '2 wins' },
            { name: 'Argentina', emoji: '🇦🇷', trueRank: 3, value: 3, displayValue: '3 wins' },
            { name: 'Italy', emoji: '🇮🇹', trueRank: 4, value: 4, displayValue: '4 wins' },
            { name: 'Brazil', emoji: '🇧🇷', trueRank: 5, value: 5, displayValue: '5 wins' },
        ],
        funFact: 'Brazil is the only nation to have played in every single FIFA World Cup since its inception in 1930.',
    },
    {
        label: 'Average MLB salary by decade: lowest → highest',
        category: 'sports',
        tags: ['sports', 'baseball', 'salaries'],
        items: [
            { name: '1970s average', emoji: '⚾', trueRank: 1, value: 52300, displayValue: '$52,300' },
            { name: '1980s average', emoji: '⚾', trueRank: 2, value: 371571, displayValue: '$371,571' },
            { name: '1990s average', emoji: '⚾', trueRank: 3, value: 1398831, displayValue: '$1.4M' },
            { name: '2000s average', emoji: '⚾', trueRank: 4, value: 2866544, displayValue: '$2.87M' },
            { name: '2020s average', emoji: '⚾', trueRank: 5, value: 4410000, displayValue: '$4.41M' },
        ],
        funFact: 'MLB average salaries grew roughly 84x from the 1970s to the 2020s.',
    },
    {
        label: 'Olympic 100m sprint record: slowest → fastest era',
        category: 'sports',
        tags: ['sports', 'olympics', 'records'],
        items: [
            { name: 'Thomas Burke (1896)', emoji: '🏅', trueRank: 1, value: 12.0, displayValue: '12.0 s' },
            { name: 'Jesse Owens (1936)', emoji: '🏅', trueRank: 2, value: 10.3, displayValue: '10.3 s' },
            { name: 'Jim Hines (1968)', emoji: '🏅', trueRank: 3, value: 9.95, displayValue: '9.95 s' },
            { name: 'Carl Lewis (1988)', emoji: '🏅', trueRank: 4, value: 9.92, displayValue: '9.92 s' },
            { name: 'Usain Bolt (2008)', emoji: '⚡', trueRank: 5, value: 9.69, displayValue: '9.69 s' },
        ],
        funFact: 'The 100m record improved by over 2 seconds in just 112 years of Olympic history.',
    },
    {
        label: 'Stadium capacity: smallest → largest',
        category: 'sports',
        tags: ['sports', 'stadiums', 'attendance'],
        items: [
            { name: 'Fenway Park (Boston)', emoji: '⚾', trueRank: 1, value: 37755, displayValue: '37,755' },
            { name: 'Wembley Stadium (London)', emoji: '⚽', trueRank: 2, value: 90000, displayValue: '90,000' },
            { name: 'Melbourne Cricket Ground', emoji: '🏏', trueRank: 3, value: 100024, displayValue: '100,024' },
            { name: 'Michigan Stadium', emoji: '🏈', trueRank: 4, value: 107601, displayValue: '107,601' },
            { name: 'Narendra Modi Stadium', emoji: '🏏', trueRank: 5, value: 132000, displayValue: '132,000' },
        ],
        funFact: 'The Narendra Modi Stadium in India is the world\'s largest cricket stadium and can hold 132,000 spectators.',
    },
    // ─── TECHNOLOGY ──────────────────────────────────────────────────
    {
        label: 'Year launched: earliest → latest',
        category: 'technology',
        tags: ['technology', 'dates', 'products'],
        items: [
            { name: 'IBM PC', emoji: '🖥️', trueRank: 1, value: 1981, displayValue: '1981' },
            { name: 'World Wide Web', emoji: '🌐', trueRank: 2, value: 1991, displayValue: '1991' },
            { name: 'iPod', emoji: '🎵', trueRank: 3, value: 2001, displayValue: '2001' },
            { name: 'iPhone', emoji: '📱', trueRank: 4, value: 2007, displayValue: '2007' },
            { name: 'ChatGPT', emoji: '🤖', trueRank: 5, value: 2022, displayValue: '2022' },
        ],
        funFact: 'The iPhone is only 16 years older than ChatGPT, but the gap between IBM PC and the Web was just 10 years.',
    },
    {
        label: 'Storage capacity of original release: smallest → largest',
        category: 'technology',
        tags: ['technology', 'storage', 'computing'],
        items: [
            { name: 'Floppy Disk (3.5")', emoji: '💾', trueRank: 1, value: 1.44, displayValue: '1.44 MB' },
            { name: 'CD-ROM', emoji: '💿', trueRank: 2, value: 700, displayValue: '700 MB' },
            { name: 'DVD', emoji: '📀', trueRank: 3, value: 4700, displayValue: '4.7 GB' },
            { name: 'Original iPod hard drive', emoji: '🎵', trueRank: 4, value: 5000, displayValue: '5 GB' },
            { name: 'Blu-ray Disc', emoji: '💿', trueRank: 5, value: 25000, displayValue: '25 GB' },
        ],
        funFact: 'The first iPod held 5 GB — more than a DVD but far less than Blu-ray. Today a microSD card can hold 1 TB.',
    },
    {
        label: 'Internet users by country (2024): fewest → most',
        category: 'technology',
        tags: ['technology', 'internet', 'population'],
        items: [
            { name: 'Australia', emoji: '🇦🇺', trueRank: 1, value: 24000000, displayValue: '~24M' },
            { name: 'Japan', emoji: '🇯🇵', trueRank: 2, value: 118000000, displayValue: '~118M' },
            { name: 'United States', emoji: '🇺🇸', trueRank: 3, value: 312000000, displayValue: '~312M' },
            { name: 'India', emoji: '🇮🇳', trueRank: 4, value: 900000000, displayValue: '~900M' },
            { name: 'China', emoji: '🇨🇳', trueRank: 5, value: 1050000000, displayValue: '~1.05B' },
        ],
        funFact: 'India surpassed the US in internet users around 2016 and is now second only to China.',
    },
    // ─── ECONOMICS ───────────────────────────────────────────────────
    {
        label: 'GDP (nominal, 2024): smallest → largest',
        category: 'economics',
        tags: ['economics', 'GDP', 'countries'],
        items: [
            { name: 'New Zealand', emoji: '🇳🇿', trueRank: 1, value: 252, displayValue: '$252B' },
            { name: 'South Korea', emoji: '🇰🇷', trueRank: 2, value: 1710, displayValue: '$1.71T' },
            { name: 'Germany', emoji: '🇩🇪', trueRank: 3, value: 4460, displayValue: '$4.46T' },
            { name: 'China', emoji: '🇨🇳', trueRank: 4, value: 18530, displayValue: '$18.53T' },
            { name: 'United States', emoji: '🇺🇸', trueRank: 5, value: 28780, displayValue: '$28.78T' },
        ],
        funFact: 'The US economy is larger than the next two (China and Germany) combined.',
    },
    {
        label: 'Minimum wage (2024): lowest → highest',
        category: 'economics',
        tags: ['economics', 'wages', 'labor'],
        items: [
            { name: 'India (national floor)', emoji: '🇮🇳', trueRank: 1, value: 0.28, displayValue: '$0.28/hr' },
            { name: 'Mexico', emoji: '🇲🇽', trueRank: 2, value: 1.68, displayValue: '$1.68/hr' },
            { name: 'United States (federal)', emoji: '🇺🇸', trueRank: 3, value: 7.25, displayValue: '$7.25/hr' },
            { name: 'United Kingdom', emoji: '🇬🇧', trueRank: 4, value: 13.60, displayValue: '£11.44 (~$13.60/hr)' },
            { name: 'Australia', emoji: '🇦🇺', trueRank: 5, value: 15.34, displayValue: 'A$23.23 (~$15.34/hr)' },
        ],
        funFact: 'The US federal minimum wage of $7.25 has not been raised since 2009 — the longest period without an increase.',
    },
    {
        label: 'Company revenue (2024): lowest → highest',
        category: 'economics',
        tags: ['economics', 'business', 'revenue'],
        items: [
            { name: 'Netflix', emoji: '🎬', trueRank: 1, value: 34, displayValue: '$34B' },
            { name: 'Samsung Electronics', emoji: '📱', trueRank: 2, value: 212, displayValue: '$212B' },
            { name: 'Apple', emoji: '🍎', trueRank: 3, value: 383, displayValue: '$383B' },
            { name: 'Amazon', emoji: '📦', trueRank: 4, value: 575, displayValue: '$575B' },
            { name: 'Walmart', emoji: '🏪', trueRank: 5, value: 648, displayValue: '$648B' },
        ],
        funFact: 'Walmart\'s annual revenue exceeds the GDP of many countries, including Sweden and Poland.',
    },
    // ─── MORE SCIENCE ────────────────────────────────────────────────
    {
        label: 'Speed of sound through material: slowest → fastest',
        category: 'science',
        tags: ['science', 'physics', 'sound'],
        items: [
            { name: 'Air (20°C)', emoji: '💨', trueRank: 1, value: 343, displayValue: '343 m/s' },
            { name: 'Water', emoji: '💧', trueRank: 2, value: 1480, displayValue: '1,480 m/s' },
            { name: 'Wood (oak)', emoji: '🪵', trueRank: 3, value: 3850, displayValue: '3,850 m/s' },
            { name: 'Steel', emoji: '🔩', trueRank: 4, value: 5960, displayValue: '5,960 m/s' },
            { name: 'Diamond', emoji: '💎', trueRank: 5, value: 12000, displayValue: '12,000 m/s' },
        ],
        funFact: 'Sound travels roughly 35 times faster through diamond than through air.',
    },
    {
        label: 'Weight of animal brain: lightest → heaviest',
        category: 'science',
        tags: ['science', 'biology', 'weight'],
        items: [
            { name: 'Cat', emoji: '🐱', trueRank: 1, value: 30, displayValue: '30 g' },
            { name: 'Dog', emoji: '🐕', trueRank: 2, value: 72, displayValue: '72 g' },
            { name: 'Human', emoji: '🧠', trueRank: 3, value: 1400, displayValue: '1,400 g' },
            { name: 'Dolphin', emoji: '🐬', trueRank: 4, value: 1700, displayValue: '1,700 g' },
            { name: 'Sperm Whale', emoji: '🐋', trueRank: 5, value: 7800, displayValue: '7,800 g' },
        ],
        funFact: 'Dolphins have larger brains than humans, but brain-to-body ratio still favors humans.',
    },
    // ─── MORE FOOD ───────────────────────────────────────────────────
    {
        label: 'Global coffee production: smallest → largest producer',
        category: 'food',
        tags: ['food', 'production', 'coffee'],
        items: [
            { name: 'Mexico', emoji: '🇲🇽', trueRank: 1, value: 234000, displayValue: '234K tonnes' },
            { name: 'Ethiopia', emoji: '🇪🇹', trueRank: 2, value: 497000, displayValue: '497K tonnes' },
            { name: 'Colombia', emoji: '🇨🇴', trueRank: 3, value: 671000, displayValue: '671K tonnes' },
            { name: 'Vietnam', emoji: '🇻🇳', trueRank: 4, value: 1857000, displayValue: '1.86M tonnes' },
            { name: 'Brazil', emoji: '🇧🇷', trueRank: 5, value: 3000000, displayValue: '3M tonnes' },
        ],
        funFact: 'Brazil produces more coffee than the next four countries combined.',
    },
    // ─── MORE HISTORY ────────────────────────────────────────────────
    {
        label: 'Year women gained the right to vote: earliest → latest',
        category: 'history',
        tags: ['history', 'rights', 'politics'],
        items: [
            { name: 'New Zealand', emoji: '🇳🇿', trueRank: 1, value: 1893, displayValue: '1893' },
            { name: 'Finland', emoji: '🇫🇮', trueRank: 2, value: 1906, displayValue: '1906' },
            { name: 'United States', emoji: '🇺🇸', trueRank: 3, value: 1920, displayValue: '1920' },
            { name: 'France', emoji: '🇫🇷', trueRank: 4, value: 1944, displayValue: '1944' },
            { name: 'Switzerland', emoji: '🇨🇭', trueRank: 5, value: 1971, displayValue: '1971' },
        ],
        funFact: 'Switzerland, often seen as a model democracy, was one of the last European countries to grant women the vote — in 1971.',
    },
    // ─── MORE TECHNOLOGY ─────────────────────────────────────────────
    {
        label: 'Time to reach 100 million users: slowest → fastest',
        category: 'technology',
        tags: ['technology', 'adoption', 'milestones'],
        items: [
            { name: 'Telephone', emoji: '📞', trueRank: 1, value: 75, displayValue: '75 years' },
            { name: 'Mobile phones', emoji: '📱', trueRank: 2, value: 16, displayValue: '16 years' },
            { name: 'Facebook', emoji: '👤', trueRank: 3, value: 4.5, displayValue: '4.5 years' },
            { name: 'Instagram', emoji: '📸', trueRank: 4, value: 2.5, displayValue: '2.5 years' },
            { name: 'ChatGPT', emoji: '🤖', trueRank: 5, value: 0.16, displayValue: '2 months' },
        ],
        funFact: 'ChatGPT reached 100 million users in about 2 months, making it the fastest-growing consumer app in history.',
    },
    // ─── MORE SPORTS ─────────────────────────────────────────────────
    {
        label: 'NBA career points: fewest → most',
        category: 'sports',
        tags: ['sports', 'basketball', 'records'],
        items: [
            { name: 'Larry Bird', emoji: '🏀', trueRank: 1, value: 21791, displayValue: '21,791' },
            { name: 'Shaquille O\'Neal', emoji: '🏀', trueRank: 2, value: 28596, displayValue: '28,596' },
            { name: 'Kobe Bryant', emoji: '🏀', trueRank: 3, value: 33643, displayValue: '33,643' },
            { name: 'Karl Malone', emoji: '🏀', trueRank: 4, value: 36928, displayValue: '36,928' },
            { name: 'LeBron James', emoji: '🏀', trueRank: 5, value: 40474, displayValue: '40,474+' },
        ],
        funFact: 'LeBron James passed Kareem Abdul-Jabbar in 2023 to become the NBA\'s all-time leading scorer.',
    },
    // ─── MORE POP CULTURE ────────────────────────────────────────────
    {
        label: 'Spotify monthly listeners (peak): fewest → most',
        category: 'pop-culture',
        tags: ['pop-culture', 'music', 'streaming'],
        items: [
            { name: 'Adele', emoji: '🎤', trueRank: 1, value: 48000000, displayValue: '~48M' },
            { name: 'Bad Bunny', emoji: '🐰', trueRank: 2, value: 60000000, displayValue: '~60M' },
            { name: 'Ed Sheeran', emoji: '🎸', trueRank: 3, value: 84000000, displayValue: '~84M' },
            { name: 'Taylor Swift', emoji: '🎤', trueRank: 4, value: 88000000, displayValue: '~88M' },
            { name: 'The Weeknd', emoji: '🌃', trueRank: 5, value: 106000000, displayValue: '~106M' },
        ],
        funFact: 'The Weeknd\'s "Blinding Lights" is the most-streamed song on Spotify, surpassing 4 billion streams.',
    },
    // ─── MORE ECONOMICS ──────────────────────────────────────────────
    {
        label: 'Average annual salary (software engineer, 2024): lowest → highest',
        category: 'economics',
        tags: ['economics', 'salaries', 'technology'],
        items: [
            { name: 'India', emoji: '🇮🇳', trueRank: 1, value: 10000, displayValue: '~$10K' },
            { name: 'Poland', emoji: '🇵🇱', trueRank: 2, value: 35000, displayValue: '~$35K' },
            { name: 'United Kingdom', emoji: '🇬🇧', trueRank: 3, value: 65000, displayValue: '~$65K' },
            { name: 'Germany', emoji: '🇩🇪', trueRank: 4, value: 72000, displayValue: '~$72K' },
            { name: 'United States', emoji: '🇺🇸', trueRank: 5, value: 125000, displayValue: '~$125K' },
        ],
        funFact: 'A senior engineer in San Francisco can earn more than 10x what a senior engineer in India earns.',
    },
];

export function generateSpectrumPuzzle(date: Date): SpectrumPuzzle {
    const seed = getDateSeed(date);
    const rng = createSeededRng(seed * 37 + 13);

    // Cycle through the pool using the day index so puzzles don't repeat
    // until the entire pool has been used
    const poolSize = SPECTRUM_POOL.length;
    const dayIndex = Math.floor((seed - 20260401) + poolSize) % poolSize; // offset from launch
    // Use dayIndex for deterministic cycling, with rng as fallback
    const idx = dayIndex >= 0 && dayIndex < poolSize
        ? dayIndex
        : Math.floor(rng() * poolSize);
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
