import type { AchievementDef } from '@/lib/temple-of-joy/types';

export const ACHIEVEMENTS: AchievementDef[] = [
  // ─── Source Milestones ───────────────────────────────────────────────────

  {
    id: 'firstCandle',
    name: 'First Light',
    description: 'Own your first Mood Candle.',
    flavor: 'It begins.',
  },
  {
    id: 'candleObsession',
    name: 'Cozy Operator',
    description: 'Own 1,000 Mood Candles.',
    flavor: 'You have a problem. A warm, fragrant problem.',
  },
  {
    id: 'caveDweller',
    name: 'The Cave Dweller',
    description: 'Own a Goon Cave.',
    flavor: 'Just own one.',
  },
  {
    id: 'therapyRich',
    name: 'In Therapy (Finally)',
    description: 'Own 100 Therapy sessions.',
    flavor: 'Your co-pay is legendary.',
  },
  {
    id: 'singularity',
    name: 'Singularity Achieved',
    description: 'Unlock the Bliss Singularity.',
    flavor: 'Physics: concerned.',
  },
  {
    id: 'allSources',
    name: 'Full Temple',
    description: 'Own at least 1 of every source.',
    flavor: 'The temple is complete.',
  },
  {
    id: 'tenOfEach',
    name: 'Devout Builder',
    description: 'Own 10 of every source.',
    flavor: 'Committed.',
  },
  {
    id: 'fiftyOfOne',
    name: 'True Believer',
    description: 'Own 50 of any one source.',
    flavor: 'Choose your idol wisely.',
  },
  {
    id: 'hundredOfOne',
    name: 'Zealot',
    description: 'Own 100 of any one source.',
    flavor: 'No notes.',
  },
  {
    id: 'napPodArmy',
    name: 'Fleet of Rest',
    description: 'Own 100 Nap Pods.',
    flavor: 'All of them, napping. All of them, at peace.',
  },

  // ─── Clicking ─────────────────────────────────────────────────────────────

  {
    id: 'firstClick',
    name: 'The First Joy',
    description: 'Click for the first time.',
    flavor: 'And so it began.',
  },
  {
    id: 'hundredClicks',
    name: 'Enthusiast',
    description: 'Click 100 times.',
    flavor: 'Your finger: warmed up.',
  },
  {
    id: 'thousandClicks',
    name: 'Practitioner',
    description: 'Click 1,000 times.',
    flavor: 'This is now your hobby.',
  },
  {
    id: 'tenThousandClicks',
    name: 'Are You Okay?',
    description: 'Click 10,000 times total.',
    flavor: 'We admire the dedication.',
  },
  {
    id: 'ritual',
    name: 'The Ritual',
    description: 'Trigger your first Ritual.',
    flavor: 'Seven times. The power noticed.',
  },

  // ─── Happiness Milestones ──────────────────────────────────────────────────

  {
    id: 'firstThousand',
    name: 'Humble Beginning',
    description: 'Earn 1,000 lifetime Happiness.',
    flavor: 'It counts.',
  },
  {
    id: 'tenThousandHappiness',
    name: 'Gathering Warmth',
    description: 'Earn 10,000 lifetime Happiness.',
    flavor: 'The temple notices.',
  },
  {
    id: 'millionaire',
    name: 'Happiness: Devout',
    description: 'Earn 1 Million lifetime Happiness.',
    flavor: 'You are wealthy in ways that matter.',
  },
  {
    id: 'billionaire',
    name: 'Happiness: Exalted',
    description: 'Earn 1 Billion lifetime Happiness.',
    flavor: 'Remarkable.',
  },
  {
    id: 'trillionaire',
    name: 'Happiness: Transcendent',
    description: 'Earn 1 Trillion lifetime Happiness.',
    flavor: 'First transcendence unlocked.',
  },
  {
    id: 'philosopher',
    name: 'Happiness: Blessed',
    description: 'Earn 1 Quadrillion lifetime Happiness.',
    flavor: "(That's a real number.)",
  },

  // ─── Transcendence ────────────────────────────────────────────────────────

  {
    id: 'firstPrestige',
    name: 'First Transcendence',
    description: 'Transcend for the first time.',
    flavor: 'The wheel turns.',
  },
  {
    id: 'fivePrestige',
    name: 'Five Cycles',
    description: 'Transcend 5 times.',
    flavor: 'Each time: warmer.',
  },
  {
    id: 'tenPrestige',
    name: 'Ten Cycles',
    description: 'Transcend 10 times.',
    flavor: 'The wheel has turned.',
  },
  {
    id: 'twentyPrestige',
    name: 'The Wheel Master',
    description: 'Transcend 20 times.',
    flavor: "You've lost count. The wheel has not.",
  },

  // ─── Special Mechanics ────────────────────────────────────────────────────

  {
    id: 'pilgrimageFirst',
    name: 'The First Pilgrimage',
    description: 'Complete your first Pilgrimage.',
    flavor: 'You did nothing. That was the point.',
  },
  {
    id: 'pilgrimageTen',
    name: 'The Devoted Pilgrim',
    description: 'Complete 10 Pilgrimages.',
    flavor: 'The road is familiar now.',
  },
  {
    id: 'vibeCheck',
    name: 'Vibe: Confirmed',
    description: 'Pass your first Vibe Check.',
    flavor: 'Certified.',
  },
  {
    id: 'vibeCheckTen',
    name: 'Vibe: Consistent',
    description: 'Pass 10 Vibe Checks.',
    flavor: 'Consistent vibework.',
  },
  {
    id: 'eventResolved',
    name: 'Things Happen',
    description: 'Resolve your first event.',
    flavor: 'Life is full of moments.',
  },
  {
    id: 'eventsFifty',
    name: 'A Life Well-Lived',
    description: 'Resolve 50 events total.',
    flavor: 'You showed up for all of them.',
  },
  {
    id: 'dailyOffering',
    name: 'The Daily Practice',
    description: 'Complete your first Daily Offering.',
    flavor: 'Small rituals. Big returns.',
  },

  // ─── Karma & Relics ───────────────────────────────────────────────────────

  {
    id: 'firstKarma',
    name: 'Good Energy',
    description: 'Earn your first Karma.',
    flavor: 'The universe noticed.',
  },
  {
    id: 'hundredKarma',
    name: 'Karmic Wealth',
    description: 'Earn 100 Karma.',
    flavor: 'The ledger: favorable.',
  },
  {
    id: 'goodKarma',
    name: 'Karmic Surplus',
    description: 'Hold 500 Karma at once.',
    flavor: 'Saving it for something worthy.',
  },
  {
    id: 'firstRelic',
    name: 'The First Relic',
    description: 'Equip your first Relic.',
    flavor: 'Protected by the old forces.',
  },
  {
    id: 'allRelics',
    name: 'The Full Collection',
    description: 'Unlock all Relics.',
    flavor: 'Every power. All yours.',
  },
  {
    id: 'philosophersStone',
    name: "Philosopher's Achievement",
    description: "Own the Philosopher's Stone relic.",
    flavor: 'The great work: complete.',
  },
  {
    id: 'maxRelics',
    name: 'All Slots Filled',
    description: 'Fill every available Relic slot.',
    flavor: 'No vacancy. No regrets.',
  },

  // ─── Wheel of Reincarnation ───────────────────────────────────────────────

  {
    id: 'firstWheelUpgrade',
    name: 'The Wheel Begins',
    description: 'Purchase your first Wheel of Reincarnation upgrade.',
    flavor: 'Each turn carries something forward.',
  },
  {
    id: 'fullWheel',
    name: 'The Complete Wheel',
    description: 'Purchase all Tier 4 Wheel upgrades.',
    flavor: 'The wheel has nothing left to teach. Or does it?',
  },

  // ─── Playtime ─────────────────────────────────────────────────────────────

  {
    id: 'oneHour',
    name: 'Committed',
    description: 'Play for 1 hour total.',
    flavor: 'The temple thanks you.',
  },
  {
    id: 'tenHours',
    name: 'Devoted',
    description: 'Play for 10 hours total.',
    flavor: 'This is a lifestyle now.',
  },
  {
    id: 'hundredHours',
    name: 'The Long Game',
    description: 'Play for 100 hours total.',
    flavor: 'Few have walked this path.',
  },
  {
    id: 'twoHundredHours',
    name: 'Temple Master',
    description: 'Play for 200 hours total.',
    flavor: 'Achievement unlocked: achievement unlocked.',
  },

  // ─── Hidden / Funny ───────────────────────────────────────────────────────

  {
    id: 'noUpgrades',
    name: 'The Stoic (Failed)',
    description: 'Reach 1B happiness with zero upgrades purchased.',
    flavor: 'You tried. You are a worse Stoic than Marcus Aurelius.',
    hidden: true,
  },
  {
    id: 'idleForever',
    name: 'The Enlightened Sloth',
    description: 'Let the game run for 1 hour without clicking.',
    flavor: 'Achievement for doing nothing. You earned it.',
    hidden: true,
  },
  {
    id: 'pilgrimageStreak',
    name: 'The Purist',
    description: 'Complete 5 Pilgrimages in a row without any clicking in between.',
    flavor: 'Some call it enlightenment. Others: a broken mouse.',
    hidden: true,
  },
  {
    id: 'speedPrestige',
    name: 'Burn It Down',
    description: 'Reach your first Transcendence in under 30 minutes.',
    flavor: 'The wheel spins fast when you want it to.',
    hidden: true,
  },
  {
    id: 'epicurusApproved',
    name: 'Epicurus Approved',
    description: 'Choose the frugal option in 5 philosophical events.',
    flavor: 'He would have left a review. Five stars. Small portions.',
    hidden: true,
  },

  // ─── Extended Source Milestones ──────────────────────────────────────────

  {
    id: 'twoHundredOfOne',
    name: 'Surplus',
    description: 'Own 200 of any one source.',
    flavor: 'Supply exceeds demand. Demand increases anyway.',
  },
  {
    id: 'fiveHundredOfOne',
    name: 'Industrial Devotion',
    description: 'Own 500 of any one source.',
    flavor: 'This source is your personality now.',
  },
  {
    id: 'thousandOfOne',
    name: 'Monomaniac',
    description: 'Own 1,000 of any one source.',
    flavor: 'Obsession, but make it architecture.',
  },
  {
    id: 'zenGardenUnlock',
    name: 'The Garden Awakens',
    description: 'Unlock the Zen Garden.',
    flavor: 'Every grain of sand: intentional.',
  },
  {
    id: 'omniscientSpaUnlock',
    name: 'Omniscience Achieved',
    description: 'Unlock the Omniscient Spa.',
    flavor: 'It already knew you would.',
  },
  {
    id: 'allPostPrestige',
    name: 'Beyond the Veil',
    description: 'Own at least 1 of every post-transcendence source.',
    flavor: 'The new world opens.',
  },
  {
    id: 'bobaAddiction',
    name: 'Boba Addiction',
    description: 'Buy your first Sweet Treat.',
    flavor: 'One cup. That was the deal. The deal was a lie.',
  },
  {
    id: 'studiousHaul',
    name: 'The Studious Haul',
    description: 'Own 100 Retail Therapy sessions.',
    flavor: 'You said you were just browsing. The receipts disagree.',
  },
  {
    id: 'soundBathFirst',
    name: 'The Bowl Rings',
    description: 'Buy your first Sound Bath.',
    flavor: 'Everything vibrated. You vibrated. Peak vibe.',
  },
  {
    id: 'artGalleryFirst',
    name: 'Culture Acquired',
    description: 'Buy your first Art Gallery.',
    flavor: 'You said you understood it. You were correct.',
  },
  {
    id: 'tenSweetTreats',
    name: 'Boba Empire',
    description: 'Own 10 Sweet Treats.',
    flavor: 'You have a loyalty card. It is full. You have ten loyalty cards.',
  },
  {
    id: 'artCollector',
    name: 'Art Collector',
    description: 'Own 100 Art Galleries.',
    flavor: 'The curator: you. The collection: unprecedented. The critics: silent.',
  },

  // ─── Extended Happiness Milestones ─────────────────────────────────────────

  {
    id: 'quintillion',
    name: 'Happiness: Holy',
    description: 'Earn 1 Quintillion (1e18) lifetime Happiness.',
    flavor: 'Numbers this big require faith.',
  },
  {
    id: 'septillion',
    name: 'Happiness: Sacred',
    description: 'Earn 1 Septillion (1e24) lifetime Happiness.',
    flavor: 'The accountants have given up.',
  },
  {
    id: 'nonillion',
    name: 'Happiness: Infinite',
    description: 'Earn 1 Nonillion (1e30) lifetime Happiness.',
    flavor: 'Infinity called. It wants its number back.',
  },
  {
    id: 'quindecillion',
    name: 'Happiness: Cosmic',
    description: 'Earn 1e48 lifetime Happiness.',
    flavor: 'More happiness than atoms in the sun.',
  },
  {
    id: 'happiness1e66',
    name: 'Happiness: Grand Sigh',
    description: 'Earn 1e66 lifetime Happiness.',
    flavor: 'The universe exhales.',
  },
  {
    id: 'happiness1e84',
    name: 'Happiness: Total Contentment',
    description: 'Earn 1e84 lifetime Happiness.',
    flavor: 'Not a single complaint. Ever again.',
  },
  {
    id: 'happiness1e99',
    name: 'Joy Complete',
    description: 'Earn 1e99 lifetime Happiness.',
    flavor: 'You did it. All the joy. Every last drop.',
  },

  // ─── Extended Transcendence ───────────────────────────────────────────────

  {
    id: 'thirtyPrestige',
    name: 'The Spiral',
    description: 'Transcend 30 times.',
    flavor: 'Down? Up? Neither. Both.',
  },
  {
    id: 'fiftyPrestige',
    name: 'Eternal Pilgrim',
    description: 'Transcend 50 times.',
    flavor: 'The wheel spins freely now. You are the wheel.',
  },

  // ─── Extended Playtime ─────────────────────────────────────────────────────

  {
    id: 'fiveHundredHours',
    name: 'The Dedication',
    description: 'Play for 500 hours total.',
    flavor: 'You could have learned a language. You learned joy instead.',
  },
  {
    id: 'thousandHours',
    name: 'The Magnum Opus',
    description: 'Play for 1,000 hours total.',
    flavor: 'This is your life now. It is warm.',
  },

  // ─── Patch 2: New Source Milestones ─────────────────────────────────────────

  {
    id: 'dreamWeaverUnlock',
    name: 'Dream Weaver',
    description: 'Unlock the Dream Weaver.',
    flavor: 'The thread between worlds is yours to pull.',
  },
  {
    id: 'infiniteBuffetUnlock',
    name: 'All You Can Eat (Literally)',
    description: 'Unlock the Infinite Buffet.',
    flavor: 'The plates refill before you finish. Heaven.',
  },
  {
    id: 'paradoxEngineUnlock',
    name: 'Contradiction Engine',
    description: 'Unlock the Paradox Engine.',
    flavor: 'It runs on impossibility. Somehow.',
  },
  {
    id: 'joySatelliteUnlock',
    name: 'Orbital Broadcast',
    description: 'Unlock the Joy Satellite.',
    flavor: 'Broadcasting happiness from low Earth orbit.',
  },
  {
    id: 'omegaTempleUnlock',
    name: 'The Final Temple',
    description: 'Unlock the Omega Temple.',
    flavor: 'You built the last temple. Or the first.',
  },
  {
    id: 'fiveHundredAllSources',
    name: 'Global Devotion',
    description: 'Own at least 500 of every base source.',
    flavor: 'Each one a prayer. Each one answered.',
  },
  {
    id: 'allNewSourcesOwned',
    name: 'New Temple Wing',
    description: 'Own at least 1 of every Patch 2 source.',
    flavor: 'The temple grows. The joy compounds.',
  },
  {
    id: 'thousandOfFive',
    name: 'Pentadivine',
    description: 'Own 1,000 of five different sources.',
    flavor: 'Five pillars. One thousand each. Architecture.',
  },
  {
    id: 'twoThousandOfOne',
    name: 'Fanatical',
    description: 'Own 2,000 of any one source.',
    flavor: 'This is not a hobby. This is a calling.',
  },
  {
    id: 'fiveThousandOfOne',
    name: 'The Legion',
    description: 'Own 5,000 of any one source.',
    flavor: 'An army of joy. Unstoppable.',
  },

  // ─── Patch 2: Clicking ────────────────────────────────────────────────────

  {
    id: 'fiftyThousandClicks',
    name: 'Professional Clicker',
    description: 'Click 50,000 times total.',
    flavor: 'Your finger has a six-pack.',
  },
  {
    id: 'hundredThousandClicks',
    name: 'The Machine',
    description: 'Click 100,000 times total.',
    flavor: 'You are the auto-clicker now.',
  },
  {
    id: 'ritualHundred',
    name: 'Ritual Master',
    description: 'Trigger 100 Rituals.',
    flavor: 'The ritual knows you. You know it. You are one.',
  },

  // ─── Patch 2: Happiness ───────────────────────────────────────────────────

  {
    id: 'happiness1e108',
    name: 'Happiness: Dimensional',
    description: 'Earn 1e108 lifetime Happiness.',
    flavor: 'Happiness in dimensions you cannot name.',
  },
  {
    id: 'happiness1e120',
    name: 'Happiness: Omniversal',
    description: 'Earn 1e120 lifetime Happiness.',
    flavor: 'Every universe smiles.',
  },
  {
    id: 'happiness1e135',
    name: 'Happiness: Absolute',
    description: 'Earn 1e135 lifetime Happiness.',
    flavor: 'No more units. Just... everything.',
  },
  {
    id: 'happiness1e150',
    name: 'Happiness: Final',
    description: 'Earn 1e150 lifetime Happiness.',
    flavor: 'The counter stopped. It is enough.',
  },
  {
    id: 'happiness1e200',
    name: 'Happiness: Transcendent',
    description: 'Earn 1e200 lifetime Happiness.',
    flavor: 'Numbers gave up. Joy continued.',
  },
  {
    id: 'happiness1e300',
    name: 'Happiness: Infinite',
    description: 'Earn 1e300 lifetime Happiness.',
    flavor: 'The universe ran out of digits. You did not run out of joy.',
  },

  // ─── Patch 2: Transcendence ───────────────────────────────────────────────

  {
    id: 'seventyFivePrestige',
    name: 'The Eternal Return',
    description: 'Transcend 75 times.',
    flavor: 'Nietzsche would be proud. Or horrified.',
  },
  {
    id: 'hundredPrestige',
    name: 'Centurion',
    description: 'Transcend 100 times.',
    flavor: 'One hundred lives. Each one better.',
  },
  {
    id: 'twoHundredPrestige',
    name: 'The Infinite Spiral',
    description: 'Transcend 200 times.',
    flavor: 'You have been everywhere. You are still going.',
  },

  // ─── Ascension (meta-prestige) ────────────────────────────────────────────

  {
    id: 'firstAscension',
    name: 'Ascended',
    description: 'Ascend for the first time.',
    flavor: 'The cycle of cycles begins. The Sun remembers you now.',
  },
  {
    id: 'fiveAscension',
    name: 'Radiant Soul',
    description: 'Ascend 5 times.',
    flavor: 'Light upon light upon light.',
  },
  {
    id: 'tenAscension',
    name: 'The Bright One',
    description: 'Ascend 10 times.',
    flavor: 'You no longer reflect the joy. You are its source.',
  },

  // ─── Patch 2: Karma & Relics ──────────────────────────────────────────────

  {
    id: 'thousandKarma',
    name: 'Karmic Abundance',
    description: 'Hold 1,000 Karma at once.',
    flavor: 'The universe owes you many favours.',
  },
  {
    id: 'fiveThousandKarma',
    name: 'Karmic Overflow',
    description: 'Hold 5,000 Karma at once.',
    flavor: 'Karma is now your currency.',
  },
  {
    id: 'tenThousandKarma',
    name: 'Karmic Flood',
    description: 'Hold 10,000 Karma at once.',
    flavor: 'The river of karma flows from you.',
  },
  {
    id: 'fiveRelics',
    name: 'Collector',
    description: 'Unlock 5 different Relics.',
    flavor: 'A modest collection. A serious start.',
  },
  {
    id: 'tenRelics',
    name: 'Curator',
    description: 'Unlock 10 different Relics.',
    flavor: 'Half the collection. All the satisfaction.',
  },
  {
    id: 'twentyRelics',
    name: 'Archivist',
    description: 'Unlock 20 different Relics.',
    flavor: 'The relics whisper your name.',
  },
  {
    id: 'thirtyRelics',
    name: 'Reliquary Guardian',
    description: 'Unlock 30 different Relics.',
    flavor: 'The relics orbit you now.',
  },
  {
    id: 'allRelicsNew',
    name: 'The Complete Reliquary',
    description: 'Unlock all 40 Relics.',
    flavor: 'Every relic. Every power. All yours.',
  },

  // ─── Patch 2: Wheel ───────────────────────────────────────────────────────

  {
    id: 'wheelTier5',
    name: 'Tier 5 Complete',
    description: 'Purchase all Tier 5 Wheel upgrades.',
    flavor: 'The wheel spins faster.',
  },
  {
    id: 'wheelTier6',
    name: 'Tier 6 Complete',
    description: 'Purchase all Tier 6 Wheel upgrades.',
    flavor: 'Sacred automation begins.',
  },
  {
    id: 'wheelTier7',
    name: 'Tier 7 Complete',
    description: 'Purchase all Tier 7 Wheel upgrades.',
    flavor: 'Ascended infrastructure.',
  },
  {
    id: 'wheelTier8',
    name: 'Tier 8 Complete',
    description: 'Purchase all Tier 8 Wheel upgrades.',
    flavor: 'The omega automation hums.',
  },
  {
    id: 'wheelTier9',
    name: 'Tier 9 Complete',
    description: 'Purchase all Tier 9 Wheel upgrades.',
    flavor: 'Dimensions fold. Time loops. Architecture.',
  },
  {
    id: 'wheelTier10',
    name: 'The Complete Wheel',
    description: 'Purchase all Tier 10 Wheel upgrades.',
    flavor: 'The wheel is complete. The temple is eternal.',
  },
  {
    id: 'tenThousandShards',
    name: 'Shard Hoarder',
    description: 'Accumulate 10,000 total Bliss Shards.',
    flavor: 'Each shard a fragment of transcendence.',
  },
  {
    id: 'hundredThousandShards',
    name: 'Shard Lord',
    description: 'Accumulate 100,000 total Bliss Shards.',
    flavor: 'The shards form constellations.',
  },
  {
    id: 'millionShards',
    name: 'Shard Cosmos',
    description: 'Accumulate 1,000,000 total Bliss Shards.',
    flavor: 'A galaxy of bliss shards. Breathtaking.',
  },

  // ─── Patch 2: Special Mechanics ───────────────────────────────────────────

  {
    id: 'pilgrimageHundred',
    name: 'The Endless Walk',
    description: 'Complete 100 Pilgrimages.',
    flavor: 'Your feet know the way. Your soul follows.',
  },
  {
    id: 'vibeCheckFifty',
    name: 'Perpetual Good Vibes',
    description: 'Pass 50 Vibe Checks.',
    flavor: 'Your vibes are beyond reproach.',
  },
  {
    id: 'vibeCheckHundred',
    name: 'Vibe Transcendence',
    description: 'Pass 100 Vibe Checks.',
    flavor: 'You ARE the vibe.',
  },
  {
    id: 'eventsHundred',
    name: 'Seasoned Storyteller',
    description: 'Resolve 100 events total.',
    flavor: 'Every event is a chapter. You have a library.',
  },
  {
    id: 'offeringComplete',
    name: 'The Generous Temple',
    description: 'Complete 50 Daily Offerings.',
    flavor: 'The offering plate is full. Always.',
  },
  {
    id: 'allUpgradesPurchased',
    name: 'The Completionist',
    description: 'Purchase every available upgrade.',
    flavor: 'Nothing left to buy. Everything left to enjoy.',
  },
  {
    id: 'allSynergies',
    name: 'Perfect Harmony',
    description: 'Activate all synergies.',
    flavor: 'Every source resonates with every other.',
  },

  // ─── Patch 2: Hidden / Funny ──────────────────────────────────────────────

  {
    id: 'speedPrestige10',
    name: 'Speedrunner',
    description: 'Reach Transcendence 10 in under 10 minutes total playtime.',
    flavor: 'Was that... was that supposed to be possible?',
    hidden: true,
  },
  {
    id: 'noRelics',
    name: 'The Minimalist',
    description: 'Reach 1e30 happiness with zero relics equipped.',
    flavor: 'No relics. No shortcuts. Pure willpower.',
    hidden: true,
  },
  {
    id: 'millionClicks',
    name: 'Carpal Tunnel Enlightenment',
    description: 'Click 1,000,000 times.',
    flavor: 'Your finger has transcended. It no longer exists.',
    hidden: true,
  },
  {
    id: 'bankruptKarma',
    name: 'Spiritually Bankrupt',
    description: 'Have exactly 0 Karma after owning at least 1,000.',
    flavor: 'You spent it ALL. On what? Everything. Nothing.',
    hidden: true,
  },
  {
    id: 'allPhilosophers',
    name: 'The Symposium',
    description: 'Encounter every philosophical event.',
    flavor: 'Epicurus, Bentham, the Cave, the Question, Nietzsche, Seneca, Aristotle, Laozi. All of them.',
    hidden: true,
  },
  {
    id: 'templeEternalAchievement',
    name: 'The Eternal Temple',
    description: 'Own every source, every upgrade, every relic, and complete the Wheel.',
    flavor: 'You did it. The temple is complete. Rest now.',
    hidden: true,
  },

  // ─── Patch 2: Additional Spec Achievements ────────────────────────────────

  {
    id: 'tenThousandOfOne',
    name: 'Monoculture',
    description: 'Own 10,000 of any one source.',
    flavor: 'An obsession of architectural proportions.',
  },
  {
    id: 'fiftyOfEach',
    name: 'Devoted Architect',
    description: 'Own 50 of every source.',
    flavor: 'Every source, fifty deep.',
  },
  {
    id: 'hundredOfEach',
    name: 'The Completionist',
    description: 'Own 100 of every source.',
    flavor: 'Maximalism: achieved.',
  },
  {
    id: 'pilgrimageTwentyFive',
    name: 'The Devoted Walker',
    description: 'Complete 25 Pilgrimages.',
    flavor: 'The path knows you by name.',
  },
  {
    id: 'pilgrimageFifty',
    name: 'The Eternal Pilgrim',
    description: 'Complete 50 Pilgrimages.',
    flavor: 'You walk. The temple walks with you.',
  },
  {
    id: 'vibeCheckTwentyFive',
    name: 'Vibe: Legendary',
    description: 'Pass 25 Vibe Checks.',
    flavor: 'Your vibes are canonized.',
  },
  {
    id: 'eventsTwoHundred',
    name: 'Life Fully Lived',
    description: 'Resolve 200 events total.',
    flavor: 'No moment wasted.',
  },
  {
    id: 'dailyOfferingTen',
    name: 'The Faithful',
    description: 'Complete 10 offerings.',
    flavor: 'The tithe: consistent.',
  },
  {
    id: 'hundredThousandKarma',
    name: 'Karmic Singularity',
    description: 'Hold 100,000 Karma at once.',
    flavor: 'A black hole of good vibes.',
  },
  {
    id: 'twoThousandHours',
    name: 'The Eternal Student',
    description: 'Play for 2,000 hours total.',
    flavor: 'This is more than a hobby. It\'s a calling.',
  },
  {
    id: 'fiveThousandHours',
    name: 'Life\'s Work',
    description: 'Play for 5,000 hours total.',
    flavor: 'You have given more time to joy than most give to anything.',
  },
  {
    id: 'clickDuringPilgrimage',
    name: 'Oops',
    description: 'Click during a Pilgrimage.',
    flavor: 'You had ONE job: do nothing.',
    hidden: true,
  },
  {
    id: 'tenBuffsActive',
    name: 'Buff Hoarder',
    description: 'Have 10+ active buffs simultaneously.',
    flavor: 'Your HPS bar needs a scrollbar.',
    hidden: true,
  },
  {
    id: 'transcendUnderMinute',
    name: 'Speed Run',
    description: 'Transcend in under 1 minute.',
    flavor: 'They said it couldn\'t be done. It took 47 seconds.',
    hidden: true,
  },
  {
    id: 'omegaRelicEquipped',
    name: 'The Omega Relic',
    description: 'Equip the Omega Relic.',
    flavor: 'The circle closes.',
    hidden: true,
  },
  {
    id: 'hundredShards',
    name: 'Shard Collector',
    description: 'Accumulate 100 bliss shards.',
    flavor: 'A modest fortune in crystallized transcendence.',
  },
  {
    id: 'thousandShards',
    name: 'Shard Hoarder',
    description: 'Accumulate 1,000 bliss shards.',
    flavor: 'They glitter with purpose.',
  },
];

export const ACHIEVEMENT_MAP: Record<string, AchievementDef> = Object.fromEntries(
  ACHIEVEMENTS.map((a) => [a.id, a]),
);
