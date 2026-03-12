/**
 * Impostor — Daily Puzzle
 * Five "facts" about a topic. Two are lies. Find them both.
 */

import { createSeededRng, getDateSeed, seededShuffle } from './seed';

export interface ImpostorStatement {
    text: string;
    isFake: boolean;
    explanation: string;
}

export interface ImpostorPuzzle {
    topic: string;
    topicEmoji: string;
    category: string;
    statements: Omit<ImpostorStatement, 'isFake' | 'explanation'>[];
    _solution: ImpostorStatement[];
}

interface ImpostorTemplate {
    topic: string;
    topicEmoji: string;
    category: string;
    statements: ImpostorStatement[];
}

const IMPOSTOR_POOL: ImpostorTemplate[] = [
    {
        topic: 'The Human Heart',
        topicEmoji: '❤️',
        category: 'science',
        statements: [
            { text: 'The human heart beats approximately 100,000 times per day.', isFake: false, explanation: 'True — at ~70 bpm, that\'s about 100,800 beats per day.' },
            { text: 'The heart generates enough pressure to squirt blood 30 feet.', isFake: false, explanation: 'True — the left ventricle generates significant pressure.' },
            { text: 'A woman\'s heart beats slightly faster than a man\'s on average.', isFake: false, explanation: 'True — women average ~78 bpm vs ~70 bpm for men.' },
            { text: 'The heart is located in the exact center of the chest.', isFake: true, explanation: 'False — the heart is slightly left of center, between the lungs.' },
            { text: 'Laughing increases blood flow by 20% for up to 45 minutes.', isFake: true, explanation: 'False — while laughter does improve blood flow, the 20%/45-minute figure is fabricated. Studies show about 5-10% increase lasting a few minutes.' },
        ],
    },
    {
        topic: 'Honey',
        topicEmoji: '🍯',
        category: 'science',
        statements: [
            { text: 'Honey never spoils. Archaeologists have found 3,000-year-old honey that was still edible.', isFake: false, explanation: 'True — honey\'s low moisture and acidic pH make it incredibly shelf-stable.' },
            { text: 'Bees must visit approximately 2 million flowers to make one pound of honey.', isFake: false, explanation: 'True — it takes enormous effort from many bees to produce honey.' },
            { text: 'Honey can be used as a natural antiseptic on wounds.', isFake: false, explanation: 'True — medical-grade honey (Manuka) is used in wound care.' },
            { text: 'All honey is produced exclusively by honeybees (Apis mellifera).', isFake: true, explanation: 'False — several species of bees produce honey, including stingless bees (Meliponini).' },
            { text: 'Honey changes color based on the ambient temperature it\'s stored in.', isFake: true, explanation: 'False — honey may crystallize in cold temperatures, but its color is determined by the flower source, not storage temperature.' },
        ],
    },
    {
        topic: 'The Moon',
        topicEmoji: '🌙',
        category: 'science',
        statements: [
            { text: 'The Moon is slowly drifting away from Earth at about 3.8 cm per year.', isFake: false, explanation: 'True — tidal interactions are gradually increasing the Moon\'s orbital distance.' },
            { text: 'There is no wind on the Moon, so footprints left by astronauts could last millions of years.', isFake: false, explanation: 'True — without atmosphere or erosion, prints can last indefinitely.' },
            { text: 'The Moon has moonquakes, similar to earthquakes.', isFake: false, explanation: 'True — Apollo missions detected shallow and deep moonquakes.' },
            { text: 'The same side of the Moon always faces Earth because it doesn\'t rotate.', isFake: true, explanation: 'False — the Moon does rotate, but it\'s tidally locked, meaning its rotation period equals its orbital period.' },
            { text: 'The Moon is approximately 1/4 the size of Earth in diameter.', isFake: true, explanation: 'False — the Moon\'s diameter is about 27% of Earth\'s (3,474 km vs 12,742 km), which is closer to 1/3.7, not 1/4.' },
        ],
    },
    {
        topic: 'Octopuses',
        topicEmoji: '🐙',
        category: 'science',
        statements: [
            { text: 'Octopuses have three hearts and blue blood.', isFake: false, explanation: 'True — two branchial hearts pump blood through gills, one systemic heart pumps it through the body. Blue blood is due to copper-based hemocyanin.' },
            { text: 'An octopus can fit through any opening larger than its beak.', isFake: false, explanation: 'True — since the beak is their only hard body part, they can squeeze through tiny gaps.' },
            { text: 'Each octopus arm has its own mini-brain and can act independently.', isFake: false, explanation: 'True — about 2/3 of an octopus\'s neurons are in its arms, allowing semi-autonomous movement.' },
            { text: 'Octopuses are known to form long-term social bonds with other octopuses.', isFake: true, explanation: 'False — most octopus species are solitary and sometimes cannibalistic. They rarely form social bonds.' },
            { text: 'Octopuses can regenerate lost arms and also grow extra arms beyond eight.', isFake: true, explanation: 'False — while they can regenerate lost arms, they don\'t grow extra ones. An octopus always has exactly eight arms.' },
        ],
    },
    {
        topic: 'Ancient Rome',
        topicEmoji: '🏛️',
        category: 'history',
        statements: [
            { text: 'Romans used urine as mouthwash because of its ammonia content.', isFake: false, explanation: 'True — urine was used for cleaning teeth and laundry due to its ammonia, which acts as a bleaching agent.' },
            { text: 'The Colosseum could be flooded for mock naval battles called naumachiae.', isFake: false, explanation: 'True — early in its history, the Colosseum arena could be flooded for staged sea battles.' },
            { text: 'Roman concrete is stronger than modern concrete and some structures are still standing after 2,000 years.', isFake: false, explanation: 'True — Roman marine concrete actually gets stronger over time due to seawater interaction with volcanic ash.' },
            { text: 'The Roman Empire at its peak controlled over 50% of the world\'s total population.', isFake: true, explanation: 'False — at its peak, Rome controlled about 25-30% of the world\'s population (around 60-70 million of ~250 million).' },
            { text: 'Julius Caesar was the first Roman Emperor.', isFake: true, explanation: 'False — Caesar was a dictator, not an emperor. Augustus (Octavian) was the first Roman Emperor.' },
        ],
    },
    {
        topic: 'Bananas',
        topicEmoji: '🍌',
        category: 'science',
        statements: [
            { text: 'Bananas are technically berries, while strawberries are not.', isFake: false, explanation: 'True — botanically, bananas meet the definition of a berry (fleshy fruit from a single ovary), while strawberries do not.' },
            { text: 'Bananas are slightly radioactive due to their potassium content.', isFake: false, explanation: 'True — bananas contain potassium-40, a naturally occurring radioactive isotope.' },
            { text: 'The banana we eat today (Cavendish) is a different variety from what people ate in the 1950s (Gros Michel).', isFake: false, explanation: 'True — Panama disease wiped out the Gros Michel variety, leading to the Cavendish becoming dominant.' },
            { text: 'Banana plants are actually trees, making bananas a tree fruit.', isFake: true, explanation: 'False — banana "trees" are actually the world\'s largest herb. They have no woody trunk.' },
            { text: 'Wild bananas contain large, hard seeds and are nearly inedible.', isFake: true, explanation: 'False — wild bananas DO contain large seeds, but they are edible (just less pleasant). This statement is partially misleading but the "nearly inedible" part is the false claim.' },
        ],
    },
    {
        topic: 'The Olympics',
        topicEmoji: '🏅',
        category: 'sports',
        statements: [
            { text: 'The Olympic gold medal is actually made mostly of silver with a gold coating.', isFake: false, explanation: 'True — Olympic gold medals have been required to contain at least 6 grams of gold plating on sterling silver since 1912.' },
            { text: 'Women were not allowed to compete in the Olympic marathon until 1984.', isFake: false, explanation: 'True — the women\'s marathon debuted at the 1984 Los Angeles Olympics.' },
            { text: 'The Olympic rings represent the five inhabited continents of the world.', isFake: false, explanation: 'True — the five rings symbolize Africa, the Americas, Asia, Europe, and Oceania.' },
            { text: 'The Olympic flame has been continuously burning since the first modern Olympics in 1896.', isFake: true, explanation: 'False — the Olympic torch relay tradition only began at the 1936 Berlin Olympics. There is no perpetual flame.' },
            { text: 'Every country that has hosted the Olympics has won at least one gold medal during their Games.', isFake: true, explanation: 'False — Canada hosted the 1976 Montreal Olympics and failed to win a single gold medal.' },
        ],
    },
    {
        topic: 'Sleep',
        topicEmoji: '😴',
        category: 'science',
        statements: [
            { text: 'Humans spend roughly one-third of their lives sleeping.', isFake: false, explanation: 'True — with 8 hours of sleep per day, that\'s about 33% of a lifetime.' },
            { text: 'It\'s impossible to sneeze while you\'re asleep.', isFake: false, explanation: 'True — during REM sleep, certain motor neurons are suppressed, making sneezing virtually impossible.' },
            { text: 'Elephants sleep only about 2 hours per day in the wild.', isFake: false, explanation: 'True — wild elephants average about 2 hours of sleep, often sleeping standing up.' },
            { text: 'Dreaming occurs exclusively during REM sleep.', isFake: true, explanation: 'False — while vivid dreams are most common in REM, non-REM sleep stages also produce dreams, though they tend to be less vivid.' },
            { text: 'Humans are the only species that willingly delay sleep.', isFake: true, explanation: 'False — while this is a popular claim, some animals like dolphins can voluntarily delay sleep, and domestic animals sometimes stay awake for social reasons.' },
        ],
    },
    {
        topic: 'Languages',
        topicEmoji: '🗣️',
        category: 'language',
        statements: [
            { text: 'There are more English speakers in China than in the United States.', isFake: false, explanation: 'True — due to China\'s massive population and English education, there are more English learners/speakers than the entire U.S. population.' },
            { text: 'The Hawaiian alphabet has only 13 letters.', isFake: false, explanation: 'True — Hawaiian uses 13 letters: 5 vowels (a, e, i, o, u) and 8 consonants (h, k, l, m, n, p, w, ʻ).' },
            { text: 'The word "set" has more definitions than any other English word.', isFake: false, explanation: 'True — the Oxford English Dictionary gives "set" over 430 definitions, the most of any English word.' },
            { text: 'Mandarin Chinese is the hardest language to learn for English speakers.', isFake: true, explanation: 'False — while Mandarin is challenging, the FSI rates Japanese, Arabic, and Korean as equally or more difficult. Difficulty also depends on the individual learner.' },
            { text: 'Every language in the world has a word for the color blue.', isFake: true, explanation: 'False — many languages (including ancient Greek, Japanese until modern era, and several African languages) historically had no separate word for blue, often grouping it with green.' },
        ],
    },
    {
        topic: 'Coffee',
        topicEmoji: '☕',
        category: 'food',
        statements: [
            { text: 'Coffee is the second most traded commodity in the world after oil.', isFake: false, explanation: 'True — coffee is one of the most valuable legally traded commodities globally.' },
            { text: 'The caffeine in coffee was originally a plant defense mechanism against insects.', isFake: false, explanation: 'True — caffeine acts as a natural pesticide, paralyzing and killing insects that feed on the plant.' },
            { text: 'Finland consumes the most coffee per capita in the world.', isFake: false, explanation: 'True — Finland leads in per-capita coffee consumption at about 12 kg per person per year.' },
            { text: 'Decaf coffee contains absolutely zero caffeine.', isFake: true, explanation: 'False — decaf coffee still contains small amounts of caffeine, typically 2-15 mg per cup compared to 95 mg in regular coffee.' },
            { text: 'Coffee beans grow on bushes that can reach up to 30 feet tall.', isFake: true, explanation: 'False — while coffee plants can grow tall, they\'re typically pruned to 5-7 feet. The "30 feet" claim is an exaggeration; even unpruned, they rarely exceed 15 feet.' },
        ],
    },
];

export function generateImpostorPuzzle(date: Date): ImpostorPuzzle {
    const seed = getDateSeed(date);
    const rng = createSeededRng(seed * 47 + 23);

    const idx = Math.floor(rng() * IMPOSTOR_POOL.length);
    const template = IMPOSTOR_POOL[idx];

    const shuffledStatements = seededShuffle(template.statements, rng);

    return {
        topic: template.topic,
        topicEmoji: template.topicEmoji,
        category: template.category,
        statements: shuffledStatements.map(({ isFake: _, explanation: _e, ...rest }) => rest),
        _solution: shuffledStatements,
    };
}

export function checkImpostorGuess(
    puzzle: ImpostorPuzzle,
    selectedTexts: string[],
): { correctCount: number; correctTexts: string[]; wrongTexts: string[] } {
    const fakeTexts = puzzle._solution.filter(s => s.isFake).map(s => s.text);
    const correctTexts = selectedTexts.filter(t => fakeTexts.includes(t));
    const wrongTexts = selectedTexts.filter(t => !fakeTexts.includes(t));
    return { correctCount: correctTexts.length, correctTexts, wrongTexts };
}

export function computeImpostorScore(
    foundBothOnGuess: number | null,
    totalFound: number,
): number {
    if (foundBothOnGuess === 1) return 100;
    if (foundBothOnGuess === 2) return 50;
    if (totalFound === 1) return 20;
    return 0;
}
