import type { AchievementDef } from '@/lib/temple-of-joy/types';

export const ACHIEVEMENTS: AchievementDef[] = [
  // ─── Building Milestones ───────────────────────────────────────────────────

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
    id: 'allBuildings',
    name: 'Full Temple',
    description: 'Own at least 1 of every building.',
    flavor: 'The temple is complete.',
  },
  {
    id: 'tenOfEach',
    name: 'Devout Builder',
    description: 'Own 10 of every building.',
    flavor: 'Committed.',
  },
  {
    id: 'fiftyOfOne',
    name: 'True Believer',
    description: 'Own 50 of any one building.',
    flavor: 'Choose your idol wisely.',
  },
  {
    id: 'hundredOfOne',
    name: 'Zealot',
    description: 'Own 100 of any one building.',
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
    flavor: 'First prestige unlocked.',
  },
  {
    id: 'philosopher',
    name: 'Happiness: Blessed',
    description: 'Earn 1 Quadrillion lifetime Happiness.',
    flavor: "(That's a real number.)",
  },

  // ─── Prestige ─────────────────────────────────────────────────────────────

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
    description: 'Reach your first Prestige in under 30 minutes.',
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

  // ─── Extended Building Milestones ──────────────────────────────────────────

  {
    id: 'twoHundredOfOne',
    name: 'Surplus',
    description: 'Own 200 of any one building.',
    flavor: 'Supply exceeds demand. Demand increases anyway.',
  },
  {
    id: 'fiveHundredOfOne',
    name: 'Industrial Devotion',
    description: 'Own 500 of any one building.',
    flavor: 'This building is your personality now.',
  },
  {
    id: 'thousandOfOne',
    name: 'Monomaniac',
    description: 'Own 1,000 of any one building.',
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
    description: 'Own at least 1 of every post-prestige building.',
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

  // ─── Extended Prestige ─────────────────────────────────────────────────────

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
];

export const ACHIEVEMENT_MAP: Record<string, AchievementDef> = Object.fromEntries(
  ACHIEVEMENTS.map((a) => [a.id, a]),
);
