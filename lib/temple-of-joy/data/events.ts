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
    // happinessBonus: 0 — game engine treats this as 5 minutes of current HPS
    effect: { happinessBonus: 0 },
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
        effect: { happinessBonus: 1000, hpsMultiplierDuration: 1800, hpsMultiplier: 3 },
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
    body: "'Excess diminishes the feast,' he says, gesturing at your buildings.",
    choices: [
      { label: 'Agree with him',            effect: { karmaBonus: 30 } },
      { label: 'Order the large plate anyway', effect: { happinessBonus: 1000 } },
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
    body: "'Is happiness enough?' You consider this. The buildings hum softly behind you.",
    choices: [
      { label: 'Yes. It is enough.', effect: { permanentHPSPercent: 0.1, karmaBonus: 10 } },
      { label: 'There must be more.', effect: { karmaBonus: 40, hpsMultiplierDuration: 1800, hpsMultiplier: 3 } },
    ],
  },
];

export const EVENT_MAP: Record<string, GameEventDef> = Object.fromEntries(
  EVENTS.map((e) => [e.id, e]),
);
