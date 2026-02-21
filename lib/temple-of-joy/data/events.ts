import type { GameEventDef } from '@/lib/temple-of-joy/types';

export const EVENTS: GameEventDef[] = [
  // ─── Blessing Events ───────────────────────────────────────────────────────

  {
    id: 'coffeeStranger',
    type: 'blessing',
    title: "A Stranger's Gift",
    body: "A stranger paid for your coffee. No reason given. Perhaps this is what grace feels like.",
    effect: { hpsMultiplierDuration: 300, hpsMultiplier: 1.15 },
  },
  {
    id: 'perfectWeather',
    type: 'blessing',
    title: 'Perfect Weather',
    body: 'The temperature is exactly right. A soft breeze. You are, for a moment, completely fine.',
    effect: { hpsMultiplierDuration: 600, hpsMultiplier: 2 },
  },
  {
    id: 'twentyDollars',
    type: 'blessing',
    title: 'Found: $20',
    body: "In an old jacket pocket. It was always there. Happiness, too, was always there.",
    effect: { happinessBonus: 5 },
  },
  {
    id: 'perfectNap',
    type: 'blessing',
    title: 'The Perfect Nap',
    body: 'You woke up before the alarm. Refreshed. Restored. Reborn, almost.',
    effect: { hpsMultiplierDuration: 300, hpsMultiplier: 3 },
  },
  {
    id: 'packageArrived',
    type: 'blessing',
    title: 'Package Arrived Early',
    body: 'Not tomorrow. Today. It was already on the porch. You were not prepared for this level of joy.',
    effect: { hpsMultiplierDuration: 120, hpsMultiplier: 2.5 },
  },
  {
    id: 'tableReady',
    type: 'blessing',
    title: 'Table Ready Immediately',
    body: 'No wait. They took you right away. The table: a good one. Near the window.',
    effect: { hpsMultiplierDuration: 180, hpsMultiplier: 2 },
  },
  {
    id: 'greenLights',
    type: 'blessing',
    title: 'Every Green Light',
    body: 'You hit every green light. All of them. Scientists have no explanation.',
    effect: { hpsMultiplierDuration: 240, hpsMultiplier: 1.5 },
  },
  {
    id: 'songOnRadio',
    type: 'blessing',
    title: 'That Song Came On',
    body: 'The exact right song. At the exact right moment. You turned it up.',
    effect: { hpsMultiplierDuration: 360, hpsMultiplier: 1.75 },
  },

  // ─── Choice Events ─────────────────────────────────────────────────────────

  {
    id: 'freeSunday',
    type: 'choice',
    title: 'A Free Sunday',
    body: 'You have a completely free Sunday. Nothing planned. The whole day: yours.',
    choices: [
      { label: 'Stay in',  effect: { hpsMultiplierDuration: 14400, hpsMultiplier: 2 } },
      { label: 'Go out',   effect: { hpsMultiplierDuration: 3600,  hpsMultiplier: 5 } },
    ],
  },
  {
    id: 'waiterOffersDesert',
    type: 'choice',
    title: 'The Dessert Question',
    body: "The waiter leans in. 'Would you like to see the dessert menu?' You feel the weight of the question.",
    choices: [
      { label: 'Yes, of course',      effect: { hpsMultiplierDuration: 7200, hpsMultiplier: 2 } },
      { label: 'No. I am satisfied.', effect: { permanentHPSPercent: 0.1 } },
    ],
  },
  {
    id: 'oldFriendCalls',
    type: 'choice',
    title: 'An Old Friend',
    body: "Your phone buzzes. An old friend. 'Hey, haven't talked in forever.' The moment hangs.",
    choices: [
      { label: 'Long call (2 hours)', effect: { hpsMultiplierDuration: 10800, hpsMultiplier: 1.15 } },
      { label: 'Quick catch-up',      effect: { permanentHPCPercent: 0.05 } },
    ],
  },
  {
    id: 'unexpectedBonus',
    type: 'choice',
    title: 'Unexpected Bonus',
    body: 'You received something unexpected. More than anticipated. The universe, for once, overdelivered.',
    choices: [
      {
        label: 'Spend it immediately',
        effect: { happinessBonus: 15, hpsMultiplierDuration: 1800, hpsMultiplier: 3 },
      },
      { label: 'Invest in the future', effect: { permanentHPSPercent: 0.15 } },
    ],
  },
  {
    id: 'foundNewPlace',
    type: 'choice',
    title: 'The New Place',
    body: 'You found a new coffee shop / park / restaurant. It might become your place.',
    choices: [
      { label: 'Become a regular',     effect: { hpsMultiplierDuration: 14400, hpsMultiplier: 1.5 } },
      { label: 'Treasure the mystery', effect: { karmaBonus: 25 } },
    ],
  },
  {
    id: 'rainyDay',
    type: 'choice',
    title: 'Rainy Day',
    body: "It's raining. You could go outside anyway, or you could stay in with something warm.",
    choices: [
      { label: 'Go outside anyway', effect: { hpsMultiplierDuration: 3600, hpsMultiplier: 3 } },
      { label: 'Stay in',           effect: { hpsMultiplierDuration: 7200, hpsMultiplier: 2, karmaBonus: 5 } },
    ],
  },

  // ─── Philosophical Events ──────────────────────────────────────────────────

  {
    id: 'epicurusVisit',
    type: 'philosophical',
    title: 'Epicurus Walks In',
    body: "'Excess diminishes the feast,' he says, gesturing at your sources.",
    choices: [
      { label: 'Agree with him',            effect: { karmaBonus: 30 } },
      { label: 'Order the large plate anyway', effect: { happinessBonus: 10 } },
    ],
  },
  {
    id: 'benthamVisit',
    type: 'philosophical',
    title: 'A Utilitarian Arrives',
    body: "Bentham takes a seat. 'The calculus is clear,' he says. 'Maximize. Always.' He seems tired.",
    choices: [
      { label: 'Maximize',   effect: { hpsMultiplierDuration: 3600, hpsMultiplier: 5 } },
      { label: 'Rest instead', effect: { karmaBonus: 20, hpsMultiplierDuration: 7200, hpsMultiplier: 1.5 } },
    ],
  },
  {
    id: 'caveQuestion',
    type: 'philosophical',
    title: 'The Cave Question',
    body: 'You are asked: would you accept a life of perfect simulated pleasure? The question hangs in the air.',
    choices: [
      { label: 'Yes. Obviously.',       effect: { permanentHPSPercent: 0.05 } },
      { label: 'I need it to be real.', effect: { karmaBonus: 50 } },
    ],
  },
  {
    id: 'hedonismQuestion',
    type: 'philosophical',
    title: 'The Question',
    body: "'Is happiness enough?' You consider this. The sources hum softly behind you.",
    choices: [
      { label: 'Yes. It is enough.', effect: { permanentHPSPercent: 0.1, karmaBonus: 10 } },
      { label: 'There must be more.', effect: { karmaBonus: 40, hpsMultiplierDuration: 1800, hpsMultiplier: 3 } },
    ],
  },

  // ── Patch 2: Blessing Events ──
  {
    id: 'cosmicDelivery',
    type: 'blessing',
    title: 'Cosmic Delivery',
    body: 'A package arrives from space. Inside: concentrated joy. Postage: paid.',
    effect: { hpsMultiplier: 4, hpsMultiplierDuration: 300 },
  },
  {
    id: 'doubleRainbow',
    type: 'blessing',
    title: 'Double Rainbow',
    body: 'Two rainbows. At once. The sky is showing off.',
    effect: { hpsMultiplier: 2, hpsMultiplierDuration: 600 },
  },
  {
    id: 'perfectSandwich',
    type: 'blessing',
    title: 'The Perfect Sandwich',
    body: 'Every ingredient in exact proportion. Bread: warm. Filling: transcendent.',
    effect: { happinessBonus: 50 },
  },
  {
    id: 'foundRemote',
    type: 'blessing',
    title: 'Found the Remote',
    body: 'It was between the cushions. Of course it was.',
    effect: { hpsMultiplier: 2.5, hpsMultiplierDuration: 300 },
  },
  {
    id: 'catPurring',
    type: 'blessing',
    title: 'Cat Started Purring',
    body: 'Unprompted. On your lap. Volume: maximum.',
    effect: { hpsMultiplier: 3, hpsMultiplierDuration: 480 },
  },
  {
    id: 'longWeekend',
    type: 'blessing',
    title: 'Surprise Long Weekend',
    body: 'Monday is off. Nobody told you until now. A gift.',
    effect: { hpsMultiplier: 5, hpsMultiplierDuration: 180 },
  },

  // ── Patch 2: Choice Events ──
  {
    id: 'dreamOffer',
    type: 'choice',
    title: 'The Dream Offer',
    body: 'A dream offers you a gift: power now, or wisdom forever?',
    choices: [
      { label: 'Power now', effect: { hpsMultiplier: 10, hpsMultiplierDuration: 300 } },
      { label: 'Wisdom forever', effect: { permanentHPSPercent: 0.2 } },
    ],
  },
  {
    id: 'mysteriousStranger2',
    type: 'choice',
    title: 'The Mysterious Stranger (Returns)',
    body: 'The stranger is back. They have two envelopes. One glows.',
    choices: [
      { label: 'Glowing envelope', effect: { hpsMultiplier: 8, hpsMultiplierDuration: 120 } },
      { label: 'Plain envelope', effect: { karmaBonus: 100, permanentHPSPercent: 0.1 } },
    ],
  },
  {
    id: 'timeTravelOffer',
    type: 'choice',
    title: 'Time Travel Opportunity',
    body: 'A clock appears. You can revisit any happy memory, or create a new one.',
    choices: [
      { label: 'Revisit the past', effect: { hpsMultiplier: 4, hpsMultiplierDuration: 600 } },
      { label: 'Create something new', effect: { happinessBonus: 100, karmaBonus: 25 } },
    ],
  },
  {
    id: 'cosmicGamble',
    type: 'choice',
    title: 'The Cosmic Gamble',
    body: 'The universe offers a bet. Risk something for something greater?',
    choices: [
      { label: 'All in', effect: { hpsMultiplier: 20, hpsMultiplierDuration: 60 } },
      { label: 'Play it safe', effect: { permanentHPSPercent: 0.15, karmaBonus: 15 } },
    ],
  },

  // ── Patch 2: Philosophical Events ──
  {
    id: 'nietzscheVisit',
    type: 'philosophical',
    title: 'Nietzsche at the Door',
    body: '"What if you had to live this exact life, infinitely?" He stares intensely.',
    choices: [
      { label: 'I would change nothing.', effect: { permanentHPSPercent: 0.2, karmaBonus: 20 } },
      { label: 'I would change everything.', effect: { hpsMultiplier: 5, hpsMultiplierDuration: 600 } },
    ],
  },
  {
    id: 'senecaAdvice',
    type: 'philosophical',
    title: 'Seneca Sends a Letter',
    body: '"It is not that we have a short time to live, but that we waste a great deal of it."',
    choices: [
      { label: 'Waste no more.', effect: { permanentHPSPercent: 0.15 } },
      { label: 'Some waste is sacred.', effect: { karmaBonus: 75, hpsMultiplier: 3, hpsMultiplierDuration: 300 } },
    ],
  },
  {
    id: 'aristotleQuestion',
    type: 'philosophical',
    title: 'Aristotle\'s Question',
    body: '"Is the good life the pleasant life, the engaged life, or the meaningful life?"',
    choices: [
      { label: 'All three, together.', effect: { permanentHPSPercent: 0.1, permanentHPCPercent: 0.1, karmaBonus: 30 } },
      { label: 'The pleasant life. Obviously.', effect: { hpsMultiplier: 8, hpsMultiplierDuration: 300 } },
    ],
  },
  {
    id: 'laozi',
    type: 'philosophical',
    title: 'Laozi Appears',
    body: '"The journey of a thousand miles begins with a single step." He gestures at your sources.',
    choices: [
      { label: 'Take the step.', effect: { permanentHPSPercent: 0.25 } },
      { label: 'I have already arrived.', effect: { karmaBonus: 100 } },
    ],
  },
];

export const EVENT_MAP: Record<string, GameEventDef> = Object.fromEntries(
  EVENTS.map((e) => [e.id, e]),
);
