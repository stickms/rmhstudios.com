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
    tags: string[];
    statements: ImpostorStatement[];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// IMPORTANT: Every template MUST have exactly 5 statements —
//            3 with isFake: false   and   2 with isFake: true
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const IMPOSTOR_POOL: ImpostorTemplate[] = [
    // ── 1. SCIENCE / BIOLOGY: The Human Heart ────────────────────────────
    {
        topic: 'The Human Heart',
        topicEmoji: '\u2764\uFE0F',
        category: 'science',
        tags: ['science', 'biology', 'medicine'],
        statements: [
            // TRUE
            { text: 'The human heart beats approximately 100,000 times per day.', isFake: false, explanation: 'True — at ~70 bpm, that comes to about 100,800 beats per day.' },
            // TRUE
            { text: 'The heart generates enough pressure to squirt blood 30 feet.', isFake: false, explanation: 'True — the left ventricle generates significant arterial pressure.' },
            // TRUE
            { text: 'A woman\'s heart beats slightly faster than a man\'s on average.', isFake: false, explanation: 'True — women average ~78 bpm vs ~70 bpm for men.' },
            // FAKE
            { text: 'The heart is located in the exact center of the chest.', isFake: true, explanation: 'False — the heart sits slightly left of center, with about two-thirds of its mass in the left half of the chest.' },
            // FAKE
            { text: 'Your heart stops beating every time you sneeze.', isFake: true, explanation: 'False — the heart does not stop when you sneeze. The sensation is caused by a change in chest pressure that may briefly alter heart rhythm, but the heart continues beating.' },
        ],
    },
    // ── 2. SCIENCE / BIOLOGY: Octopuses ──────────────────────────────────
    {
        topic: 'Octopuses',
        topicEmoji: '\uD83D\uDC19',
        category: 'science',
        tags: ['science', 'biology', 'animals'],
        statements: [
            // TRUE
            { text: 'Octopuses have three hearts and blue blood.', isFake: false, explanation: 'True — two branchial hearts pump blood through gills; one systemic heart pumps it through the body. Blue blood is due to copper-based hemocyanin.' },
            // TRUE
            { text: 'An octopus can fit through any opening larger than its beak.', isFake: false, explanation: 'True — the beak is their only hard body part, so they can squeeze through remarkably small gaps.' },
            // TRUE
            { text: 'Each octopus arm has its own cluster of neurons and can act semi-independently.', isFake: false, explanation: 'True — about two-thirds of an octopus\'s neurons reside in its arms.' },
            // FAKE
            { text: 'Octopuses form long-term social bonds and live in cooperative family groups.', isFake: true, explanation: 'False — most octopus species are solitary and sometimes cannibalistic. They do not form social bonds or family units.' },
            // FAKE
            { text: 'All octopus species are venomous enough to be dangerous to humans.', isFake: true, explanation: 'False — while all octopuses have venom, only the blue-ringed octopus carries venom potent enough to be dangerous to humans. The vast majority of species are harmless to people.' },
        ],
    },
    // ── 3. SCIENCE / GENETICS: Human DNA ─────────────────────────────────
    {
        topic: 'Human DNA',
        topicEmoji: '\uD83E\uDDEC',
        category: 'science',
        tags: ['science', 'biology', 'genetics'],
        statements: [
            // TRUE
            { text: 'Humans share about 60% of their DNA with bananas.', isFake: false, explanation: 'True — many fundamental cellular genes are shared across all life, resulting in roughly 60% genetic overlap with banana plants.' },
            // TRUE
            { text: 'If you stretched out all the DNA in one human cell, it would be about 6 feet long.', isFake: false, explanation: 'True — each cell contains about 2 meters (6.5 feet) of DNA packed into a nucleus just 6 micrometers wide.' },
            // FAKE
            { text: 'Identical twins have the exact same fingerprints because they share 100% of their DNA.', isFake: true, explanation: 'False — fingerprints are influenced by random conditions in the womb. Identical twins always have different fingerprints despite sharing virtually all DNA.' },
            // TRUE
            { text: 'Every human on Earth shares 99.9% of their DNA with every other human.', isFake: false, explanation: 'True — genetic variation between any two humans accounts for only about 0.1% of the genome.' },
            // FAKE
            { text: 'Humans have more genes than any other organism on Earth.', isFake: true, explanation: 'False — humans have roughly 20,000-25,000 protein-coding genes. Rice has about 38,000, and the water flea Daphnia pulex has about 31,000. Gene count does not correlate with complexity.' },
        ],
    },
    // ── 4. SCIENCE / PHYSICS: The Speed of Light ─────────────────────────
    {
        topic: 'The Speed of Light',
        topicEmoji: '\uD83D\uDCA1',
        category: 'science',
        tags: ['science', 'physics'],
        statements: [
            // TRUE
            { text: 'Light from the Sun takes about 8 minutes and 20 seconds to reach Earth.', isFake: false, explanation: 'True — at ~300,000 km/s over ~150 million km, sunlight takes roughly 8 minutes 20 seconds.' },
            // TRUE
            { text: 'Nothing can travel faster than light in a vacuum according to Einstein\'s theory of relativity.', isFake: false, explanation: 'True — the speed of light in a vacuum (~299,792 km/s) is the universal speed limit in special relativity.' },
            // FAKE
            { text: 'Light travels at the same speed regardless of the medium it passes through.', isFake: true, explanation: 'False — light slows down in denser media. It travels about 25% slower in water and about 35% slower in glass compared to a vacuum.' },
            // TRUE
            { text: 'The speed of light was first measured with reasonable accuracy in 1676 using observations of Jupiter\'s moon Io.', isFake: false, explanation: 'True — Ole R\u00F8mer observed delays in Io\'s eclipses and estimated light\'s speed, the first quantitative measurement.' },
            // FAKE
            { text: 'Sound travels faster than light through Earth\'s atmosphere.', isFake: true, explanation: 'False — light travels at roughly 300,000 km/s in air, while sound travels at only about 0.343 km/s. Light is nearly a million times faster than sound in air.' },
        ],
    },
    // ── 5. SCIENCE / CHEMISTRY: The Periodic Table ───────────────────────
    {
        topic: 'The Periodic Table',
        topicEmoji: '\u2697\uFE0F',
        category: 'science',
        tags: ['science', 'chemistry'],
        statements: [
            // TRUE
            { text: 'Gold is so malleable that a single ounce can be beaten into a sheet covering 100 square feet.', isFake: false, explanation: 'True — gold is the most malleable metal; one troy ounce can be hammered to roughly 100 sq ft of gold leaf.' },
            // TRUE
            { text: 'Helium was discovered on the Sun (via its spectral lines) before it was found on Earth.', isFake: false, explanation: 'True — helium was first identified in the solar spectrum in 1868, then isolated on Earth in 1895.' },
            // TRUE
            { text: 'Diamond and graphite are both made entirely of carbon atoms.', isFake: false, explanation: 'True — they are allotropes of carbon, differing only in crystal structure.' },
            // FAKE
            { text: 'Iron is the most abundant element in the Earth\'s crust.', isFake: true, explanation: 'False — oxygen is the most abundant element in Earth\'s crust (~46% by mass). Iron ranks fourth, after oxygen, silicon, and aluminum.' },
            // FAKE
            { text: 'Platinum is the rarest naturally occurring element on Earth.', isFake: true, explanation: 'False — astatine and francium are far rarer than platinum. Astatine is the rarest naturally occurring element, with less than 30 grams estimated to exist in Earth\'s crust at any time.' },
        ],
    },
    // ── 6. SCIENCE / ASTRONOMY: The Moon ─────────────────────────────────
    {
        topic: 'The Moon',
        topicEmoji: '\uD83C\uDF19',
        category: 'science',
        tags: ['science', 'astronomy'],
        statements: [
            // TRUE
            { text: 'The Moon is slowly drifting away from Earth at about 3.8 cm per year.', isFake: false, explanation: 'True — tidal interactions gradually increase the Moon\'s orbital distance.' },
            // TRUE
            { text: 'There is no wind on the Moon, so astronaut footprints could last millions of years.', isFake: false, explanation: 'True — without atmosphere or weather erosion, imprints persist for extremely long periods.' },
            // TRUE
            { text: 'The Moon has moonquakes, which were detected by instruments left by Apollo missions.', isFake: false, explanation: 'True — Apollo seismometers detected both shallow and deep moonquakes.' },
            // FAKE
            { text: 'The same side of the Moon always faces Earth because the Moon does not rotate on its axis.', isFake: true, explanation: 'False — the Moon does rotate; it is tidally locked, meaning its rotation period equals its orbital period (~27.3 days), so the same face always points toward Earth.' },
            // FAKE
            { text: 'The Moon produces its own light, which is why it can appear bright even when it is not in direct sunlight.', isFake: true, explanation: 'False — the Moon produces no light of its own. It shines only by reflecting sunlight. When it appears bright, it is always illuminated by the Sun.' },
        ],
    },
    // ── 7. SCIENCE / ASTRONOMY: Planet Mars ──────────────────────────────
    {
        topic: 'Planet Mars',
        topicEmoji: '\uD83D\uDD34',
        category: 'science',
        tags: ['science', 'astronomy', 'space'],
        statements: [
            // TRUE
            { text: 'Mars has the tallest known volcano in the solar system, Olympus Mons, at about 72,000 feet.', isFake: false, explanation: 'True — Olympus Mons stands roughly 21.9 km (72,000 ft) above the surrounding plain.' },
            // TRUE
            { text: 'A day on Mars is only about 37 minutes longer than a day on Earth.', isFake: false, explanation: 'True — a Martian sol is approximately 24 hours and 37 minutes.' },
            // TRUE
            { text: 'Mars appears red because its surface is rich in iron oxide (rust).', isFake: false, explanation: 'True — iron oxide dust gives Mars its distinctive reddish color.' },
            // FAKE
            { text: 'Mars has a thick atmosphere that traps heat, making its surface relatively warm.', isFake: true, explanation: 'False — Mars has an extremely thin atmosphere (about 1% of Earth\'s surface pressure) with very little greenhouse effect. Its average surface temperature is about -62\u00B0C (-80\u00B0F).' },
            // FAKE
            { text: 'Mars has a strong global magnetic field similar to Earth\'s that protects it from solar wind.', isFake: true, explanation: 'False — Mars lost its global magnetic field roughly 4 billion years ago. It only has weak, localized remnant magnetic fields in its crust, offering no global protection from solar wind.' },
        ],
    },
    // ── 8. SCIENCE / MEDICINE: Vaccines & Immunity ───────────────────────
    {
        topic: 'Vaccines & Immunity',
        topicEmoji: '\uD83D\uDC89',
        category: 'science',
        tags: ['science', 'medicine'],
        statements: [
            // TRUE
            { text: 'Edward Jenner developed the first successful vaccine in 1796 using cowpox to protect against smallpox.', isFake: false, explanation: 'True — Jenner demonstrated that cowpox inoculation provided immunity to smallpox, founding the science of vaccinology.' },
            // TRUE
            { text: 'Smallpox is the only human disease that has been completely eradicated worldwide.', isFake: false, explanation: 'True — the WHO declared smallpox eradicated in 1980 after a global vaccination campaign.' },
            // FAKE
            { text: 'Antibiotics are effective against both bacterial infections and viral infections.', isFake: true, explanation: 'False — antibiotics only work against bacteria. They have no effect on viruses; antiviral drugs are needed for viral infections.' },
            // TRUE
            { text: 'The human body contains roughly as many bacterial cells as human cells.', isFake: false, explanation: 'True — current estimates put it at about 38 trillion bacterial cells vs. 30 trillion human cells, a ratio near 1.3:1.' },
            // FAKE
            { text: 'The immune system cannot distinguish between different types of pathogens and responds identically to all of them.', isFake: true, explanation: 'False — the adaptive immune system produces highly specific responses. T-cells and B-cells target specific pathogens, and the body mounts different responses to bacteria, viruses, fungi, and parasites.' },
        ],
    },
    // ── 9. HISTORY / ANCIENT: Ancient Rome ───────────────────────────────
    {
        topic: 'Ancient Rome',
        topicEmoji: '\uD83C\uDFDB\uFE0F',
        category: 'history',
        tags: ['history', 'ancient'],
        statements: [
            // TRUE
            { text: 'Romans used urine as mouthwash and laundry bleach because of its ammonia content.', isFake: false, explanation: 'True — urine was collected and used for cleaning due to its ammonia, which acts as a bleaching agent.' },
            // TRUE
            { text: 'The Colosseum could be flooded for mock naval battles called naumachiae.', isFake: false, explanation: 'True — in its early years, the Colosseum arena could be flooded for staged sea battles.' },
            // TRUE
            { text: 'Roman concrete is stronger in some ways than modern concrete; some marine structures survive after 2,000 years.', isFake: false, explanation: 'True — Roman marine concrete gets stronger over time due to seawater interaction with volcanic ash (pozzolanic reaction).' },
            // FAKE
            { text: 'Julius Caesar was the first Roman Emperor.', isFake: true, explanation: 'False — Caesar was a dictator, not an emperor. Augustus (Octavian), Caesar\'s adopted heir, became the first Roman Emperor in 27 BC.' },
            // FAKE
            { text: 'The Roman Empire at its peak controlled over half the world\'s total population.', isFake: true, explanation: 'False — at its peak, Rome controlled about 25-30% of the world\'s population (~60-70 million of ~250 million total). The Han Dynasty in China alone had a comparable population.' },
        ],
    },
    // ── 10. HISTORY / ANCIENT: Ancient Egypt ─────────────────────────────
    {
        topic: 'Ancient Egypt',
        topicEmoji: '\uD83C\uDFFA',
        category: 'history',
        tags: ['history', 'ancient'],
        statements: [
            // TRUE
            { text: 'Cleopatra lived closer in time to the Moon landing than to the construction of the Great Pyramid.', isFake: false, explanation: 'True — the Great Pyramid was built ~2560 BC, Cleopatra died 30 BC (~2530 years later), and the Moon landing was 1969 AD (~2000 years after Cleopatra).' },
            // TRUE
            { text: 'Ancient Egyptians used moldy bread as a treatment for infected wounds.', isFake: false, explanation: 'True — Egyptians applied moldy bread to wounds, unknowingly using natural antibiotics from the mold.' },
            // TRUE
            { text: 'The Great Pyramid of Giza was the tallest man-made structure for nearly 4,000 years.', isFake: false, explanation: 'True — built ~2560 BC at 481 feet, it remained the tallest structure until Lincoln Cathedral in 1311 AD.' },
            // FAKE
            { text: 'The pyramids at Giza were built by slaves captured from neighboring kingdoms.', isFake: true, explanation: 'False — archaeological evidence (worker villages, bakeries, medical care facilities) shows they were built by paid Egyptian laborers, not slaves.' },
            // FAKE
            { text: 'Ancient Egyptians invented paper as we know it today.', isFake: true, explanation: 'False — Egyptians invented papyrus (a writing surface made from plant reeds), but true paper was invented in China around 105 AD by Cai Lun. Papyrus and paper are made through fundamentally different processes.' },
        ],
    },
    // ── 11. HISTORY / MODERN: World War II ───────────────────────────────
    {
        topic: 'World War II',
        topicEmoji: '\uD83C\uDF0D',
        category: 'history',
        tags: ['history', 'wars', 'modern'],
        statements: [
            // TRUE
            { text: 'During WWII, the U.S. military used inflatable tanks as decoys to fool German reconnaissance.', isFake: false, explanation: 'True — the Ghost Army (23rd Headquarters Special Troops) used inflatable tanks, fake radio traffic, and sound effects to deceive the enemy.' },
            // TRUE
            { text: 'A carrier pigeon named G.I. Joe saved over 1,000 Allied lives by delivering a critical message in time.', isFake: false, explanation: 'True — G.I. Joe flew 20 miles in 20 minutes to stop a planned bombing of a town that Allied troops had just captured.' },
            // TRUE
            { text: 'Germany was the first country to use jet-powered fighter aircraft in combat during WWII.', isFake: false, explanation: 'True — the Messerschmitt Me 262, entering service in 1944, was the world\'s first operational jet-powered fighter.' },
            // FAKE
            { text: 'Switzerland was briefly invaded and occupied by Germany in 1940 before negotiating its neutrality.', isFake: true, explanation: 'False — Switzerland was never invaded or occupied during WWII. It maintained neutrality throughout, though Germany had contingency plans (Operation Tannenbaum) that were never executed.' },
            // FAKE
            { text: 'The D-Day landings at Normandy took place on June 6, 1945, in the final year of the war.', isFake: true, explanation: 'False — D-Day was on June 6, 1944, not 1945. The war in Europe ended in May 1945, almost a year after D-Day.' },
        ],
    },
    // ── 12. HISTORY / INVENTIONS: Famous Inventions ──────────────────────
    {
        topic: 'Famous Inventions',
        topicEmoji: '\uD83D\uDD27',
        category: 'history',
        tags: ['history', 'inventions', 'technology'],
        statements: [
            // TRUE
            { text: 'The Wright brothers\' first powered flight at Kitty Hawk lasted only 12 seconds.', isFake: false, explanation: 'True — on December 17, 1903, Orville Wright\'s first flight covered 120 feet in 12 seconds.' },
            // TRUE
            { text: 'The microwave oven was accidentally invented when an engineer noticed a candy bar melting near radar equipment.', isFake: false, explanation: 'True — Percy Spencer at Raytheon noticed his candy bar melting near an active magnetron in 1945.' },
            // FAKE
            { text: 'Thomas Edison invented the light bulb entirely on his own without building on anyone else\'s prior work.', isFake: true, explanation: 'False — many inventors worked on incandescent lighting before Edison, including Humphry Davy, Warren de la Rue, and Joseph Swan. Edison improved the design with a practical long-lasting filament.' },
            // TRUE
            { text: 'The first electronic computer, ENIAC, weighed about 30 tons and filled an entire room.', isFake: false, explanation: 'True — ENIAC (1945) weighed about 30 tons, occupied 1,800 square feet, and used 18,000 vacuum tubes.' },
            // FAKE
            { text: 'The telephone was invented in Germany by Heinrich Hertz in 1870.', isFake: true, explanation: 'False — Alexander Graham Bell was awarded the patent for the telephone in 1876 in the United States. Heinrich Hertz is known for proving the existence of electromagnetic waves, not inventing the telephone.' },
        ],
    },
    // ── 13. GEOGRAPHY / COUNTRIES: Country Borders ───────────────────────
    {
        topic: 'Country Borders',
        topicEmoji: '\uD83C\uDF0D',
        category: 'geography',
        tags: ['geography', 'countries'],
        statements: [
            // TRUE
            { text: 'Russia spans 11 time zones, more than any other country.', isFake: false, explanation: 'True — Russia stretches from UTC+2 to UTC+12.' },
            // TRUE
            { text: 'Canada has the longest coastline of any country in the world.', isFake: false, explanation: 'True — Canada\'s coastline is approximately 202,080 km, the longest of any nation.' },
            // TRUE
            { text: 'Africa is large enough to fit the United States, China, India, and most of Europe inside it.', isFake: false, explanation: 'True — Africa\'s area (~30.3 million km\u00B2) exceeds the combined areas of the U.S., China, India, and Western Europe.' },
            // FAKE
            { text: 'Brazil shares a border with every other country in South America.', isFake: true, explanation: 'False — Brazil borders every South American country except Ecuador and Chile.' },
            // FAKE
            { text: 'Australia is the largest country in the world by total land area.', isFake: true, explanation: 'False — Australia is the sixth-largest country by area (~7.7 million km\u00B2). Russia (~17.1 million km\u00B2), Canada, the U.S., China, and Brazil are all larger.' },
        ],
    },
    // ── 14. GEOGRAPHY / NATURAL WONDERS ──────────────────────────────────
    {
        topic: 'Natural Wonders',
        topicEmoji: '\u26F0\uFE0F',
        category: 'geography',
        tags: ['geography', 'natural wonders'],
        statements: [
            // TRUE
            { text: 'The Dead Sea is so salty that no fish can survive in it.', isFake: false, explanation: 'True — at about 34% salinity (nearly 10 times saltier than the ocean), the Dead Sea cannot support fish life.' },
            // TRUE
            { text: 'Lake Baikal in Russia contains about 20% of the world\'s unfrozen surface fresh water.', isFake: false, explanation: 'True — Baikal holds roughly 23,615 km\u00B3 of water, about one-fifth of the world\'s surface fresh water.' },
            // TRUE
            { text: 'Angel Falls in Venezuela is the world\'s tallest uninterrupted waterfall at about 3,212 feet.', isFake: false, explanation: 'True — Angel Falls drops 979 meters (3,212 feet) from Auyantepui mountain.' },
            // FAKE
            { text: 'The Great Barrier Reef is visible from the Moon with the naked eye.', isFake: true, explanation: 'False — no individual structures on Earth are visible to the naked eye from the Moon (~384,400 km away). This is a common myth.' },
            // FAKE
            { text: 'The Grand Canyon was formed primarily by volcanic eruptions that split the rock apart.', isFake: true, explanation: 'False — the Grand Canyon was carved primarily by the erosion of the Colorado River over approximately 5-6 million years, not by volcanic activity.' },
        ],
    },
    // ── 15. GEOGRAPHY / CITIES: World Cities ─────────────────────────────
    {
        topic: 'World Cities',
        topicEmoji: '\uD83C\uDFD9\uFE0F',
        category: 'geography',
        tags: ['geography', 'cities'],
        statements: [
            // TRUE
            { text: 'Tokyo is the most populous metropolitan area in the world with over 37 million people.', isFake: false, explanation: 'True — the Greater Tokyo Area has roughly 37-38 million residents.' },
            // TRUE
            { text: 'Reykjavik, Iceland, is the northernmost capital city of a sovereign nation.', isFake: false, explanation: 'True — at 64\u00B0N latitude, Reykjavik is farther north than any other national capital.' },
            // TRUE
            { text: 'Venice, Italy, is built on 118 small islands connected by over 400 bridges.', isFake: false, explanation: 'True — Venice sits on 118 islands in a shallow lagoon, connected by approximately 400 bridges.' },
            // FAKE
            { text: 'Dubai is the capital city of the United Arab Emirates.', isFake: true, explanation: 'False — Abu Dhabi is the capital of the UAE. Dubai is the largest and most internationally famous city, but not the capital.' },
            // FAKE
            { text: 'Paris is the most visited city in the world, with over 100 million international tourists per year.', isFake: true, explanation: 'False — while Paris is one of the most visited cities, it receives roughly 30-40 million international tourists annually, not 100 million. Bangkok and London often compete for the top spot.' },
        ],
    },
    // ── 16. FOOD: Honey ──────────────────────────────────────────────────
    {
        topic: 'Honey',
        topicEmoji: '\uD83C\uDF6F',
        category: 'food',
        tags: ['food', 'science', 'nature'],
        statements: [
            // TRUE
            { text: 'Honey never spoils. Edible honey has been found in 3,000-year-old Egyptian tombs.', isFake: false, explanation: 'True — honey\'s low moisture and acidic pH prevent bacterial growth, giving it an essentially indefinite shelf life.' },
            // TRUE
            { text: 'Bees must visit approximately 2 million flowers to make one pound of honey.', isFake: false, explanation: 'True — producing a single pound of honey requires enormous collective effort from the hive.' },
            // TRUE
            { text: 'The flavor and color of honey vary depending on which flowers the bees foraged.', isFake: false, explanation: 'True — clover honey is light and mild, buckwheat honey is dark and robust, with hundreds of varieties based on nectar source.' },
            // FAKE
            { text: 'Honey is safe to feed to infants under one year old because of its natural purity.', isFake: true, explanation: 'False — honey can contain Clostridium botulinum spores, which can cause infant botulism in babies under 12 months whose digestive systems are not mature enough to handle them.' },
            // FAKE
            { text: 'All honey is produced exclusively by honeybees of the species Apis mellifera.', isFake: true, explanation: 'False — several bee species produce honey, including stingless bees (Meliponini tribe) found in tropical regions. There are also other Apis species like Apis dorsata and Apis cerana.' },
        ],
    },
    // ── 17. FOOD / COOKING: Coffee ───────────────────────────────────────
    {
        topic: 'Coffee',
        topicEmoji: '\u2615',
        category: 'food',
        tags: ['food', 'cooking', 'culture'],
        statements: [
            // TRUE
            { text: 'Coffee beans are actually the seeds found inside a bright red fruit called a coffee cherry.', isFake: false, explanation: 'True — what we call "beans" are the processed seeds of the coffee plant\'s cherry-like fruit.' },
            // TRUE
            { text: 'The caffeine in coffee originally evolved as a natural pesticide to protect the plant from insects.', isFake: false, explanation: 'True — caffeine is toxic to many insects and acts as a chemical defense for the coffee plant.' },
            // TRUE
            { text: 'Finland consumes the most coffee per capita in the world.', isFake: false, explanation: 'True — Finland leads global per-capita coffee consumption at about 12 kg per person per year.' },
            // FAKE
            { text: 'Decaf coffee contains absolutely zero caffeine.', isFake: true, explanation: 'False — decaf coffee still contains small amounts of caffeine, typically 2-15 mg per cup (vs. ~95 mg in regular).' },
            // FAKE
            { text: 'Espresso contains more caffeine per cup than drip coffee.', isFake: true, explanation: 'False — a standard shot of espresso (~1 oz) contains about 63 mg of caffeine, while an 8 oz cup of drip coffee contains about 95 mg. Espresso is more concentrated per ounce, but a typical serving has less total caffeine.' },
        ],
    },
    // ── 18. FOOD / COOKING: Spicy Food ───────────────────────────────────
    {
        topic: 'Spicy Food',
        topicEmoji: '\uD83C\uDF36\uFE0F',
        category: 'food',
        tags: ['food', 'cooking', 'science'],
        statements: [
            // TRUE
            { text: 'Capsaicin, the compound that makes peppers spicy, triggers pain receptors rather than taste receptors.', isFake: false, explanation: 'True — capsaicin binds to TRPV1 receptors, which detect heat and pain, not taste buds.' },
            // FAKE
            { text: 'Drinking water is the most effective way to relieve the burning sensation from spicy food.', isFake: true, explanation: 'False — capsaicin is not water-soluble. Dairy products (milk, yogurt) are far more effective because casein protein binds to capsaicin and washes it away.' },
            // TRUE
            { text: 'The Scoville scale measures the spiciness (heat) of chili peppers.', isFake: false, explanation: 'True — developed by Wilbur Scoville in 1912, the scale measures capsaicin concentration in Scoville Heat Units (SHU).' },
            // TRUE
            { text: 'Birds cannot feel the burn of capsaicin, which helps pepper plants spread their seeds via bird droppings.', isFake: false, explanation: 'True — birds lack the TRPV1 receptor that responds to capsaicin, so they eat peppers freely and disperse seeds.' },
            // FAKE
            { text: 'Eating spicy food physically damages your taste buds, which is why frequent spicy eaters feel less heat.', isFake: true, explanation: 'False — spicy food does not damage taste buds. Tolerance develops because TRPV1 receptors become desensitized with repeated exposure, not from physical damage.' },
        ],
    },
    // ── 19. ANIMALS: Sharks ──────────────────────────────────────────────
    {
        topic: 'Sharks',
        topicEmoji: '\uD83E\uDD88',
        category: 'animals',
        tags: ['animals', 'nature', 'biology'],
        statements: [
            // TRUE
            { text: 'Sharks have been around for over 400 million years, predating dinosaurs by about 200 million years.', isFake: false, explanation: 'True — the earliest shark-like fossils date to roughly 450 million years ago, well before dinosaurs appeared (~230 mya).' },
            // TRUE
            { text: 'Some shark species must keep swimming to breathe, or they will suffocate.', isFake: false, explanation: 'True — obligate ram ventilators like great whites must swim to push water over their gills.' },
            // FAKE
            { text: 'Sharks can detect a single drop of blood from over a mile away.', isFake: true, explanation: 'False — sharks can detect blood at about 1 part per million, effective over hundreds of meters at most, not miles.' },
            // TRUE
            { text: 'Whale sharks are the largest fish in the ocean and are filter feeders that eat plankton.', isFake: false, explanation: 'True — whale sharks can grow over 40 feet and feed by filtering plankton and small fish.' },
            // FAKE
            { text: 'Sharks are completely immune to all forms of cancer.', isFake: true, explanation: 'False — sharks do get cancer. Tumors have been documented in many shark species. The myth was popularized by a 1992 book but has been thoroughly debunked.' },
        ],
    },
    // ── 20. ANIMALS: Bees & Pollination ──────────────────────────────────
    {
        topic: 'Bees & Pollination',
        topicEmoji: '\uD83D\uDC1D',
        category: 'animals',
        tags: ['animals', 'nature', 'science'],
        statements: [
            // TRUE
            { text: 'Honeybees communicate the location of food sources through a "waggle dance."', isFake: false, explanation: 'True — Karl von Frisch won the Nobel Prize for discovering that bees use a figure-eight waggle dance to convey direction and distance.' },
            // TRUE
            { text: 'A queen bee can lay up to 2,000 eggs per day during peak season.', isFake: false, explanation: 'True — a healthy queen lays 1,000-2,000 eggs daily at peak season.' },
            // TRUE
            { text: 'Bees can see ultraviolet light, which helps them find nectar-rich flowers.', isFake: false, explanation: 'True — bees perceive UV patterns on flower petals (called nectar guides) invisible to humans.' },
            // FAKE
            { text: 'When a honeybee stings a human, the entire hive dies within 24 hours.', isFake: true, explanation: 'False — only the individual bee that stings dies (its barbed stinger tears from its body). The rest of the hive is unaffected.' },
            // FAKE
            { text: 'Bees produce honey by chemically synthesizing sugars inside their bodies from scratch.', isFake: true, explanation: 'False — bees produce honey by collecting flower nectar (which already contains sugars), then concentrating and enzymatically processing it. They do not synthesize sugars from scratch.' },
        ],
    },
    // ── 21. NATURE: Trees & Forests ──────────────────────────────────────
    {
        topic: 'Trees & Forests',
        topicEmoji: '\uD83C\uDF33',
        category: 'animals',
        tags: ['nature', 'biology', 'environment'],
        statements: [
            // TRUE
            { text: 'Trees communicate through underground fungal networks sometimes called the "wood wide web."', isFake: false, explanation: 'True — mycorrhizal networks connect tree roots, allowing them to share nutrients and chemical signals.' },
            // TRUE
            { text: 'The oldest known living tree is a bristlecone pine in California that is over 4,800 years old.', isFake: false, explanation: 'True — "Methuselah," a Great Basin bristlecone pine, is over 4,800 years old.' },
            // FAKE
            { text: 'The Amazon Rainforest produces 20% of the world\'s oxygen, making it the planet\'s primary oxygen source.', isFake: true, explanation: 'False — the Amazon consumes nearly all the oxygen it produces through respiration and decomposition. The net contribution is close to zero. Most atmospheric oxygen comes from oceanic phytoplankton.' },
            // TRUE
            { text: 'A single large oak tree can release over 40,000 gallons of water into the atmosphere per year through transpiration.', isFake: false, explanation: 'True — large trees transpire enormous volumes of water; a mature oak can release 40,000+ gallons annually.' },
            // FAKE
            { text: 'Trees add a new ring of growth once per month, allowing scientists to determine the exact month a tree was cut down.', isFake: true, explanation: 'False — trees add one growth ring per year (not per month), corresponding to seasonal growing cycles. Dendrochronology counts annual rings to determine a tree\'s age.' },
        ],
    },
    // ── 22. SPORTS: The Olympics ──────────────────────────────────────────
    {
        topic: 'The Olympics',
        topicEmoji: '\uD83C\uDFC5',
        category: 'sports',
        tags: ['sports', 'history'],
        statements: [
            // TRUE
            { text: 'The Olympic gold medal is actually made mostly of silver with a thin gold coating.', isFake: false, explanation: 'True — since 1912, Olympic gold medals are sterling silver plated with at least 6 grams of gold.' },
            // TRUE
            { text: 'Women were not allowed to compete in the Olympic marathon until 1984.', isFake: false, explanation: 'True — the women\'s marathon debuted at the 1984 Los Angeles Olympics.' },
            // TRUE
            { text: 'The five Olympic rings represent the five inhabited continents.', isFake: false, explanation: 'True — the rings symbolize Africa, the Americas, Asia, Europe, and Oceania.' },
            // FAKE
            { text: 'The Olympic flame has been burning continuously since the first modern Olympics in 1896.', isFake: true, explanation: 'False — the torch relay tradition began at the 1936 Berlin Olympics. A new flame is lit from the Sun in Olympia, Greece, for each Games.' },
            // FAKE
            { text: 'Only amateur athletes are allowed to compete in the Olympics; professionals have always been banned.', isFake: true, explanation: 'False — the Olympics dropped its amateur-only requirement starting in the 1980s-1990s. Today, professional athletes regularly compete (e.g., NBA players in basketball since 1992).' },
        ],
    },
    // ── 23. SPORTS: Soccer (Football) ────────────────────────────────────
    {
        topic: 'Soccer (Football)',
        topicEmoji: '\u26BD',
        category: 'sports',
        tags: ['sports', 'culture'],
        statements: [
            // TRUE
            { text: 'The FIFA World Cup trophy is made of 18-karat gold and weighs about 13.6 pounds.', isFake: false, explanation: 'True — the current trophy is solid 18-karat gold, weighing 6.175 kg (13.6 lbs).' },
            // TRUE
            { text: 'Brazil has won the FIFA World Cup more times than any other country.', isFake: false, explanation: 'True — Brazil has won five times (1958, 1962, 1970, 1994, 2002).' },
            // TRUE
            { text: 'Soccer is the most popular sport in the world by total number of fans.', isFake: false, explanation: 'True — with an estimated 3.5-4 billion fans worldwide, soccer/football is the world\'s most popular sport.' },
            // FAKE
            { text: 'A standard soccer match consists of two 50-minute halves.', isFake: true, explanation: 'False — a standard match is two 45-minute halves (90 minutes total), plus stoppage time.' },
            // FAKE
            { text: 'The goalkeeper is allowed to use their hands anywhere on the field during open play.', isFake: true, explanation: 'False — the goalkeeper may only handle the ball within their own penalty area (the 18-yard box). Outside that area, they follow the same rules as outfield players.' },
        ],
    },
    // ── 24. SPORTS: Basketball ───────────────────────────────────────────
    {
        topic: 'Basketball',
        topicEmoji: '\uD83C\uDFC0',
        category: 'sports',
        tags: ['sports', 'history'],
        statements: [
            // TRUE
            { text: 'Basketball was invented in 1891 by James Naismith using a peach basket as the first hoop.', isFake: false, explanation: 'True — Naismith nailed peach baskets to an elevated track at a YMCA in Springfield, Massachusetts.' },
            // TRUE
            { text: 'Wilt Chamberlain holds the record for most points scored in a single NBA game with 100 points.', isFake: false, explanation: 'True — Chamberlain scored 100 points on March 2, 1962, for the Philadelphia Warriors against the New York Knicks.' },
            // TRUE
            { text: 'Michael Jordan was cut from his high school varsity basketball team as a sophomore.', isFake: false, explanation: 'True — Jordan was placed on the junior varsity team as a sophomore at Laney High School in Wilmington, NC.' },
            // FAKE
            { text: 'The shot clock in the NBA gives teams 30 seconds to attempt a shot.', isFake: true, explanation: 'False — the NBA shot clock is 24 seconds, not 30. The 30-second clock was used in NCAA women\'s basketball (now also 30 in men\'s).' },
            // FAKE
            { text: 'The NBA has used a three-point line since the league was founded in 1946.', isFake: true, explanation: 'False — the NBA did not adopt the three-point line until the 1979-1980 season. The ABA used it first starting in 1967, and the NBA adopted it over a decade later.' },
        ],
    },
    // ── 25. TECHNOLOGY: The Internet ─────────────────────────────────────
    {
        topic: 'The Internet',
        topicEmoji: '\uD83C\uDF10',
        category: 'technology',
        tags: ['technology', 'computing', 'history'],
        statements: [
            // TRUE
            { text: 'The first ARPANET message in 1969 was "LO" — the system crashed before "LOGIN" could be completed.', isFake: false, explanation: 'True — on October 29, 1969, UCLA sent "LO" to Stanford before the system crashed. The full "LOGIN" was sent about an hour later.' },
            // TRUE
            { text: 'Tim Berners-Lee invented the World Wide Web in 1989 while working at CERN.', isFake: false, explanation: 'True — Berners-Lee proposed and developed the WWW (HTML, HTTP, URLs) at CERN in Switzerland.' },
            // TRUE
            { text: 'The first website ever created, info.cern.ch, is still online today.', isFake: false, explanation: 'True — CERN restored and maintains the original first website as a historical resource.' },
            // FAKE
            { text: 'The internet and the World Wide Web are the same thing.', isFake: true, explanation: 'False — the internet is the global network infrastructure; the World Wide Web is a service running on top of it, using browsers to access pages via HTTP.' },
            // FAKE
            { text: 'Email was invented after the World Wide Web and depends on web browsers to function.', isFake: true, explanation: 'False — email predates the Web by over two decades. Ray Tomlinson sent the first network email in 1971, while the Web was invented in 1989. Email uses its own protocols (SMTP, IMAP, POP3), not HTTP.' },
        ],
    },
    // ── 26. TECHNOLOGY: Video Games ──────────────────────────────────────
    {
        topic: 'Video Games',
        topicEmoji: '\uD83C\uDFAE',
        category: 'technology',
        tags: ['technology', 'computing', 'pop culture'],
        statements: [
            // TRUE
            { text: 'The video game industry generates more revenue globally than the film and music industries combined.', isFake: false, explanation: 'True — the global gaming industry revenue exceeds $180 billion annually, surpassing combined film box office and recorded music.' },
            // TRUE
            { text: 'Pac-Man was originally named "Puck-Man" in Japan, from the Japanese "paku-paku" (chomping sound).', isFake: false, explanation: 'True — it was renamed for Western markets partly due to concern the name could be vandalized on arcade cabinets.' },
            // TRUE
            { text: 'Nintendo was founded in 1889 as a playing card company.', isFake: false, explanation: 'True — Fusajiro Yamauchi founded Nintendo in Kyoto in 1889 to produce handmade hanafuda playing cards.' },
            // FAKE
            { text: 'The first commercially sold video game was Pong by Atari in 1972.', isFake: true, explanation: 'False — the first commercially sold video game was "Computer Space" by Nutting Associates in 1971. Pong (1972) was Atari\'s first game and far more successful, but not the first.' },
            // FAKE
            { text: 'The original Tetris was created by an American programmer at MIT in 1984.', isFake: true, explanation: 'False — Tetris was created by Soviet programmer Alexey Pajitnov in Moscow in 1985 while working at the Soviet Academy of Sciences. It was not made at MIT or by an American.' },
        ],
    },
    // ── 27. POP CULTURE / MOVIES: Disney & Pixar ─────────────────────────
    {
        topic: 'Disney & Pixar',
        topicEmoji: '\uD83C\uDFA5',
        category: 'pop culture',
        tags: ['pop culture', 'movies'],
        statements: [
            // TRUE
            { text: 'Walt Disney holds the record for most Academy Awards won by an individual, with 22 Oscars.', isFake: false, explanation: 'True — Walt Disney won 22 competitive Academy Awards plus 4 honorary awards.' },
            // TRUE
            { text: 'Toy Story (1995) was the first feature-length film made entirely with computer-generated imagery.', isFake: false, explanation: 'True — Pixar\'s Toy Story was the first fully CGI animated feature film.' },
            // FAKE
            { text: 'Walt Disney himself provided the original voice of Mickey Mouse for over 30 years.', isFake: true, explanation: 'False — Disney voiced Mickey from 1928 to 1947 (about 19 years), after which sound effects artist Jimmy MacDonald and later Wayne Allwine took over. It was not over 30 years.' },
            // TRUE
            { text: 'The famous Disney castle logo is inspired by Neuschwanstein Castle in Bavaria, Germany.', isFake: false, explanation: 'True — Sleeping Beauty Castle at Disneyland (and the logo) drew heavy inspiration from Neuschwanstein Castle.' },
            // FAKE
            { text: 'Pixar\'s first feature film was A Bug\'s Life, released in 1996.', isFake: true, explanation: 'False — Pixar\'s first feature film was Toy Story, released in 1995. A Bug\'s Life was their second, released in 1998.' },
        ],
    },
    // ── 28. POP CULTURE / MUSIC: Music History ───────────────────────────
    {
        topic: 'Music History',
        topicEmoji: '\uD83C\uDFB5',
        category: 'pop culture',
        tags: ['pop culture', 'music', 'history'],
        statements: [
            // TRUE
            { text: 'The Beatles hold the record for the most number-one hits on the Billboard Hot 100, with 20 songs.', isFake: false, explanation: 'True — the Beatles had 20 number-one singles on the Billboard Hot 100.' },
            // TRUE
            { text: '"Happy Birthday to You" was under copyright until 2016, and using it commercially required paying royalties.', isFake: false, explanation: 'True — Warner/Chappell collected royalties until a 2016 court ruling placed the song in the public domain.' },
            // TRUE
            { text: 'Beethoven was completely deaf when he composed his famous Ninth Symphony.', isFake: false, explanation: 'True — Beethoven was profoundly deaf by the time he completed the Ninth Symphony in 1824.' },
            // FAKE
            { text: 'Elvis Presley wrote most of his biggest hit songs himself.', isFake: true, explanation: 'False — Elvis did not write any of his hit songs. They were written by songwriters like Leiber & Stoller, Otis Blackwell, and others. Some co-writing credits were business arrangements, not actual authorship.' },
            // FAKE
            { text: 'The electric guitar was invented in the 1960s during the rise of rock and roll.', isFake: true, explanation: 'False — the first commercially successful electric guitar (the "Frying Pan" by Rickenbacker) was produced in 1932. Electric guitars were widely used in jazz and blues decades before the 1960s.' },
        ],
    },
    // ── 29. LANGUAGE: English Language Oddities ──────────────────────────
    {
        topic: 'English Language Oddities',
        topicEmoji: '\uD83D\uDCDA',
        category: 'language',
        tags: ['language', 'words'],
        statements: [
            // TRUE
            { text: 'The word "set" has more definitions than any other English word in the Oxford English Dictionary.', isFake: false, explanation: 'True — "set" has over 430 senses in the OED, the most of any English word.' },
            // TRUE
            { text: 'The dot over the letters "i" and "j" is called a "tittle."', isFake: false, explanation: 'True — the small distinguishing mark is formally called a tittle.' },
            // FAKE
            { text: 'The English language has more words than any other language on Earth because it has never borrowed from foreign languages.', isFake: true, explanation: 'False — English has an enormous vocabulary precisely because it has borrowed extensively from Latin, French, German, Greek, Arabic, Hindi, and many other languages throughout its history.' },
            // TRUE
            { text: 'The sentence "The quick brown fox jumps over the lazy dog" uses every letter of the English alphabet.', isFake: false, explanation: 'True — it is a well-known pangram containing all 26 letters.' },
            // FAKE
            { text: '"Typewriter" is the longest word in the English language that uses letters from only one row of the keyboard.', isFake: true, explanation: 'False — while "typewriter" (10 letters) is a well-known example using only the top QWERTY row, longer words exist, such as "proprietor" (10 letters, also top row) and "rupturewort" (11 letters, top row).' },
        ],
    },
    // ── 30. LANGUAGE: Word Origins ───────────────────────────────────────
    {
        topic: 'Word Origins',
        topicEmoji: '\uD83D\uDD24',
        category: 'language',
        tags: ['language', 'words', 'history'],
        statements: [
            // TRUE
            { text: 'The word "salary" comes from the Latin "salarium," related to salt, because Roman soldiers received salt allowances.', isFake: false, explanation: 'True — "salarium" is connected to salt (sal), and Roman soldiers received allowances for salt purchases.' },
            // TRUE
            { text: 'The word "quarantine" comes from Italian "quaranta giorni" (40 days) — the waiting period for ships during the Black Death.', isFake: false, explanation: 'True — Venice required ships to anchor for 40 days before landing during plague outbreaks.' },
            // TRUE
            { text: 'The word "alphabet" comes from the first two Greek letters: alpha and beta.', isFake: false, explanation: 'True — "alphabet" derives directly from the Greek letters alpha (\u03B1) and beta (\u03B2).' },
            // FAKE
            { text: 'The word "robot" was coined by Albert Einstein in a 1921 physics paper.', isFake: true, explanation: 'False — "robot" was coined by Czech writer Karel \u010Capek (from his brother Josef\'s suggestion) in his 1920 play R.U.R. It comes from the Czech "robota," meaning forced labor.' },
            // FAKE
            { text: 'The word "emoji" comes from the English words "emotion" and "icon."', isFake: true, explanation: 'False — "emoji" is Japanese, from "e" (picture) + "moji" (character). The resemblance to "emotion" is a coincidence.' },
        ],
    },
    // ── 31. MATH: Pi & Famous Numbers ────────────────────────────────────
    {
        topic: 'Pi & Famous Numbers',
        topicEmoji: '\uD83E\uDDEE',
        category: 'math',
        tags: ['math', 'numbers'],
        statements: [
            // TRUE
            { text: 'Pi has been calculated to over 100 trillion digits, and no repeating pattern has ever been found.', isFake: false, explanation: 'True — pi is irrational and has been computed to over 100 trillion digits with no repeating sequence.' },
            // TRUE
            { text: 'A googol is 1 followed by 100 zeros, and Google\'s name is a play on this number.', isFake: false, explanation: 'True — the founders referenced the mathematical googol; the name "Google" stuck.' },
            // FAKE
            { text: 'Zero was invented by ancient Greek mathematicians before any other civilization used it.', isFake: true, explanation: 'False — zero as a number was developed in India (Brahmagupta, 7th century). Ancient Greeks were philosophically resistant to the concept. Babylonians and Mayans also used zero-like concepts independently.' },
            // TRUE
            { text: 'The Fibonacci sequence appears frequently in nature, such as in the spiral arrangement of sunflower seeds.', isFake: false, explanation: 'True — sunflower seed heads, pinecone spirals, and many natural structures follow Fibonacci number patterns.' },
            // FAKE
            { text: 'Pi is exactly equal to 22/7 — the fraction is a perfect representation.', isFake: true, explanation: 'False — 22/7 (which equals 3.142857...) is only an approximation. Pi is irrational and equals 3.14159265..., which cannot be expressed as any fraction.' },
        ],
    },
    // ── 32. MATH: Probability & Statistics ───────────────────────────────
    {
        topic: 'Probability & Statistics',
        topicEmoji: '\uD83C\uDFB2',
        category: 'math',
        tags: ['math', 'numbers', 'statistics'],
        statements: [
            // TRUE
            { text: 'In a room of just 23 people, there is a greater than 50% chance that two share a birthday.', isFake: false, explanation: 'True — the "birthday paradox" shows that with 23 people, the probability of a shared birthday exceeds 50.7%.' },
            // FAKE
            { text: 'If you flip a fair coin 10 times and get heads every time, the 11th flip is more likely to be tails.', isFake: true, explanation: 'False — this is the "gambler\'s fallacy." Each flip is independent; the probability is always exactly 50/50 regardless of previous results.' },
            // TRUE
            { text: 'The Monty Hall problem shows that switching doors gives you a 2/3 chance of winning, not 1/2.', isFake: false, explanation: 'True — after the host reveals a losing door, switching gives 2/3 probability vs. 1/3 for staying.' },
            // TRUE
            { text: 'A standard deck of 52 cards can be arranged in more unique orders than there are atoms in the Earth.', isFake: false, explanation: 'True — 52! is approximately 8 \u00D7 10^67, while Earth contains roughly 10^50 atoms.' },
            // FAKE
            { text: 'The law of averages guarantees that a losing streak in gambling will always be followed by a winning streak of equal length.', isFake: true, explanation: 'False — there is no "law of averages" that guarantees compensating outcomes. Each independent random event has no memory of previous results. Streaks are normal in random processes.' },
        ],
    },
    // ── 33. SCIENCE / BIOLOGY: Sleep ─────────────────────────────────────
    {
        topic: 'Sleep',
        topicEmoji: '\uD83D\uDE34',
        category: 'science',
        tags: ['science', 'biology', 'health'],
        statements: [
            // TRUE
            { text: 'Humans spend roughly one-third of their lives sleeping.', isFake: false, explanation: 'True — averaging 8 hours of sleep per day means about 33% of a lifetime.' },
            // TRUE
            { text: 'Elephants sleep only about 2 hours per day in the wild.', isFake: false, explanation: 'True — GPS and activity studies show wild elephants average about 2 hours of sleep per day.' },
            // TRUE
            { text: 'Dolphins sleep with one half of their brain at a time so they can keep swimming and breathing.', isFake: false, explanation: 'True — unihemispheric slow-wave sleep lets one hemisphere rest while the other stays alert.' },
            // FAKE
            { text: 'Dreaming occurs exclusively during REM sleep and never during other sleep stages.', isFake: true, explanation: 'False — while vivid, story-like dreams are most common in REM, simpler thought-like dreams also occur during non-REM stages.' },
            // FAKE
            { text: 'Humans can fully adapt to sleeping only 3 hours per night with no negative health effects.', isFake: true, explanation: 'False — chronic sleep deprivation (below ~7 hours for most adults) leads to cognitive impairment, weakened immunity, increased cardiovascular risk, and other serious health problems. Very few people have genetic mutations allowing shorter sleep without consequences.' },
        ],
    },
    // ── 34. SCIENCE / GEOLOGY: Volcanoes ─────────────────────────────────
    {
        topic: 'Volcanoes',
        topicEmoji: '\uD83C\uDF0B',
        category: 'science',
        tags: ['science', 'geology', 'nature'],
        statements: [
            // TRUE
            { text: 'There are more active volcanoes on the ocean floor than on land.', isFake: false, explanation: 'True — the majority of Earth\'s volcanic activity occurs along mid-ocean ridges and submarine hotspots.' },
            // TRUE
            { text: 'The 1883 eruption of Krakatoa was the loudest sound in recorded history, heard nearly 3,000 miles away.', isFake: false, explanation: 'True — Krakatoa\'s eruption was heard on Rodrigues Island, about 4,800 km (3,000 miles) away.' },
            // TRUE
            { text: 'The eruption of Mount Tambora in 1815 caused the "Year Without a Summer" in 1816.', isFake: false, explanation: 'True — Tambora\'s massive eruption ejected so much ash and sulfur dioxide that global temperatures dropped, causing crop failures worldwide in 1816.' },
            // FAKE
            { text: 'Lava from all volcanoes is the same temperature, approximately 700\u00B0C.', isFake: true, explanation: 'False — lava temperature varies by composition. Basaltic lava erupts at 1,000-1,200\u00B0C, while rhyolitic lava can be 650-800\u00B0C. There is no single universal temperature.' },
            // FAKE
            { text: 'Volcanic eruptions only occur along tectonic plate boundaries and never in the middle of a plate.', isFake: true, explanation: 'False — hotspot volcanism occurs far from plate boundaries. Hawaii sits in the middle of the Pacific Plate, and its volcanoes are formed by a mantle plume beneath the plate.' },
        ],
    },
    // ── 35. SCIENCE / SPACE: Space Exploration ───────────────────────────
    {
        topic: 'Space Exploration',
        topicEmoji: '\uD83D\uDE80',
        category: 'science',
        tags: ['science', 'astronomy', 'history'],
        statements: [
            // TRUE
            { text: 'The International Space Station orbits Earth every ~90 minutes, so astronauts see about 16 sunrises per day.', isFake: false, explanation: 'True — the ISS orbits at roughly 28,000 km/h, completing one orbit every ~90 minutes.' },
            // TRUE
            { text: 'Voyager 1, launched in 1977, is the most distant human-made object and has entered interstellar space.', isFake: false, explanation: 'True — Voyager 1 crossed the heliopause in 2012 and continues transmitting from interstellar space.' },
            // TRUE
            { text: 'In space, astronauts grow up to 2 inches taller because the lack of gravity decompresses their spines.', isFake: false, explanation: 'True — without gravity compressing spinal discs, astronauts temporarily gain about 2 inches (5 cm) in height.' },
            // FAKE
            { text: 'Neil Armstrong\'s famous Moon landing quote was pre-written and approved by NASA\'s communications team.', isFake: true, explanation: 'False — Armstrong stated he composed the "one small step" quote himself, shortly before or during the lunar descent. NASA did not script it.' },
            // FAKE
            { text: 'The Space Shuttle program sent astronauts to the Moon six times between 1981 and 2011.', isFake: true, explanation: 'False — the Space Shuttle never traveled to the Moon. It operated only in low Earth orbit. All crewed Moon missions were part of the Apollo program (1969-1972).' },
        ],
    },
    // ── 36. SCIENCE / MEDICINE: The Human Brain ──────────────────────────
    {
        topic: 'The Human Brain',
        topicEmoji: '\uD83E\uDDE0',
        category: 'science',
        tags: ['science', 'biology', 'medicine'],
        statements: [
            // TRUE
            { text: 'The brain uses about 20% of the body\'s total energy despite being only about 2% of body weight.', isFake: false, explanation: 'True — the brain is metabolically expensive, consuming roughly 20% of the body\'s oxygen and glucose.' },
            // TRUE
            { text: 'The brain itself cannot feel pain because it has no pain receptors.', isFake: false, explanation: 'True — the brain lacks nociceptors. Headaches originate from surrounding tissues, blood vessels, and meninges.' },
            // FAKE
            { text: 'Humans only use 10% of their brain.', isFake: true, explanation: 'False — brain imaging shows virtually all regions have functions and are active at various times. We use all of our brain, just not every region simultaneously.' },
            // TRUE
            { text: 'The human brain contains roughly 86 billion neurons.', isFake: false, explanation: 'True — neuroscientist Suzana Herculano-Houzel determined the count is approximately 86 billion.' },
            // FAKE
            { text: 'Brain cells cannot regenerate — once a neuron dies, it is gone forever.', isFake: true, explanation: 'False — neurogenesis (the creation of new neurons) does occur in certain brain regions, notably the hippocampus and the olfactory bulb, even in adults. This was discovered in the late 1990s.' },
        ],
    },
];

export function generateImpostorPuzzle(date: Date): ImpostorPuzzle {
    const seed = getDateSeed(date);
    const rng = createSeededRng(seed * 47 + 23);

    // Cycle through the full pool so every puzzle is used before any repeats.
    // Each "cycle" of poolSize days shuffles the pool in a deterministic order,
    // then picks the next template from that shuffled order.
    const poolSize = IMPOSTOR_POOL.length;
    const cycle = Math.floor(seed / poolSize);
    const indexInCycle = seed % poolSize;
    const shuffledPool = seededShuffle([...IMPOSTOR_POOL], createSeededRng(cycle * 31 + 7));
    const template = shuffledPool[indexInCycle];

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
