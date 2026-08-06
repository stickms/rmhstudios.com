/**
 * The ledger's fallback generator: receipts without a model.
 *
 * The infinite scroll's contract is that it never ends. DeepSeek cannot honour
 * that on its own — it can be unconfigured in a dev checkout, rate-limited,
 * timing out, down, or simply return JSON that does not parse — and every one of
 * those turns "keep scrolling forever" into a dead stop at the bottom of a list.
 *
 * So the model is an *enhancement*, not a dependency. When it answers, its lines
 * are used. When it does not, these are, and the reader sees a slightly less
 * inventive receipt instead of an error. The ledger extends either way.
 *
 * Pure and client-safe: no Prisma, no network, no `Math.random` unless the
 * caller passes it. Every draw comes from an injected source so a batch is
 * reproducible in tests and so callers can seed it.
 *
 * ## Why combinatorial rather than a fixed list
 *
 * A list of 200 canned receipts repeats visibly after two minutes of scrolling.
 * Composing from independent banks — a thing, a place, a way it went unpaid —
 * gives 60 × 24 × 20 ≈ 29,000 distinct openings before the shapes start to
 * echo, which is far past the point where anyone is still reading. The banks are
 * intentionally mundane: the joke is the accumulation, not any single line.
 */

import {
  DEBT_CATEGORIES,
  sampleDebtCents,
  type DebtCategory,
  MAX_ITEM_CHARS,
  MAX_NOTE_CHARS,
} from '@/lib/kaikai-debt/debt';

/** A thing he failed to pay for, with the category it books under. */
const THINGS: readonly { item: string; category: DebtCategory }[] = [
  { item: 'A flat white', category: 'food' },
  { item: 'Half a burrito', category: 'food' },
  { item: 'The last slice', category: 'food' },
  { item: 'A vending machine crisps, stuck', category: 'food' },
  { item: 'His share of the pizza', category: 'food' },
  { item: 'A meal deal', category: 'food' },
  { item: 'Two energy drinks', category: 'food' },
  { item: 'A round at the bar', category: 'food' },
  { item: 'Breakfast, allegedly "on him"', category: 'food' },
  { item: 'A bag of ice', category: 'food' },
  { item: 'Bus fare, northbound', category: 'transit' },
  { item: 'His half of the taxi', category: 'transit' },
  { item: 'A day pass he never tapped', category: 'transit' },
  { item: 'Petrol money', category: 'transit' },
  { item: 'A parking ticket, contested', category: 'transit' },
  { item: 'An airport transfer', category: 'transit' },
  { item: 'A bike he borrowed', category: 'transit' },
  { item: 'His third of the rent shortfall', category: 'rent' },
  { item: 'The electricity bill', category: 'rent' },
  { item: 'A replacement door handle', category: 'rent' },
  { item: 'The deposit he "would sort"', category: 'rent' },
  { item: 'Wifi, one month', category: 'rent' },
  { item: 'A phone charger', category: 'gear' },
  { item: 'A borrowed hoodie', category: 'gear' },
  { item: 'One (1) HDMI cable', category: 'gear' },
  { item: 'A controller with sticky drift', category: 'gear' },
  { item: 'An umbrella, never returned', category: 'gear' },
  { item: 'A tent peg situation', category: 'gear' },
  { item: 'Headphones, one side working', category: 'gear' },
  { item: 'A power bank at 3%', category: 'gear' },
  { item: 'A losing bet on his own darts', category: 'gambling' },
  { item: 'Double or nothing, resolved as nothing', category: 'gambling' },
  { item: 'A coin flip he called twice', category: 'gambling' },
  { item: 'The fantasy league buy-in', category: 'gambling' },
  { item: 'A wager on his own punctuality', category: 'gambling' },
  { item: 'Emotional damages, karaoke', category: 'emotional' },
  { item: 'A spoiled season finale', category: 'emotional' },
  { item: 'Being the only one who laughed', category: 'emotional' },
  { item: 'A group photo he blinked in', category: 'emotional' },
  { item: 'One ruined surprise', category: 'emotional' },
  { item: 'Two hours of a Saturday', category: 'temporal' },
  { item: 'Forty minutes outside a cinema', category: 'temporal' },
  { item: 'A held table for six', category: 'temporal' },
  { item: 'An entire lunch break', category: 'temporal' },
  { item: 'A rescheduled thing, twice', category: 'temporal' },
  { item: 'A stamp', category: 'other' },
  { item: 'Printer credit', category: 'other' },
  { item: 'A locker deposit', category: 'other' },
  { item: 'The good scissors', category: 'other' },
  { item: 'A birthday card everyone signed', category: 'other' },
];

/** Where it happened. */
const PLACES: readonly string[] = [
  'at the corner shop',
  'outside the station',
  'in the car park',
  'at the counter',
  'on the way back',
  'at the till',
  'halfway up the hill',
  'in the queue',
  'at the after-party',
  'on a Tuesday',
  'during the interval',
  'at the picnic',
  'in the office kitchen',
  'at the seaside',
  'on the group trip',
  'before the film started',
  'at the market',
  'in the rain',
];

/** How it went unpaid — the dry sentence that becomes the row's reason. */
const EXCUSES: readonly string[] = [
  'Said he had no change. Still has no change.',
  'Promised to transfer it that evening. The evening passed.',
  'Claimed the card machine was down. It was not down.',
  'Offered to "get the next one". There was no next one.',
  'Said he would sort it at the weekend, without naming a weekend.',
  'Insisted it was already covered. It was not already covered.',
  'Went to the cash point and came back with a story.',
  'Argued the split was unfair, then left before it was settled.',
  'Said he had sent it. Nothing arrived.',
  'Told everyone he had paid, loudly, while not paying.',
  'Was suddenly on a phone call of unclear origin.',
  'Rounded his share down to zero and called it even.',
  'Volunteered to hold the receipt, then lost the receipt.',
  'Explained that he would remember. He did not remember.',
  'Said the app was broken. The app was fine.',
  'Left a coin on the table and considered the matter closed.',
];

/** Truncate to the ledger's column widths without ever emitting an empty string. */
function fit(text: string, max: number, fallback: string): string {
  const trimmed = text.trim().replace(/\s+/g, ' ').slice(0, max);
  return trimmed || fallback;
}

/** Uniform pick, with the randomness injected so a batch can be reproduced. */
function pick<T>(list: readonly T[], random: () => number): T {
  const index = Math.min(list.length - 1, Math.floor(Math.max(0, random()) * list.length));
  return list[index]!;
}

export interface FallbackReceipt {
  item: string;
  note: string;
  category: DebtCategory;
  amountCents: number;
}

/**
 * Compose `count` receipts with no model involved.
 *
 * Amounts come from the same {@link sampleDebtCents} the model path uses, so a
 * fallback batch is statistically indistinguishable from a generated one — the
 * $5-skewed distribution is a property of the ledger, not of who wrote the prose.
 *
 * `creditorHandles` are woven into some of the notes so the fallback lines name
 * real people the way the generated ones do. Empty is fine; the notes simply
 * stay impersonal.
 */
export function generateFallbackReceipts(
  count: number,
  creditorHandles: readonly string[] = [],
  random: () => number = Math.random,
): FallbackReceipt[] {
  const out: FallbackReceipt[] = [];
  for (let i = 0; i < Math.max(0, count); i++) {
    const thing = pick(THINGS, random);
    const place = pick(PLACES, random);
    const excuse = pick(EXCUSES, random);

    // Roughly a third of the lines name someone, so the archive reads as a mix
    // of "owed to a person" and "owed generally" rather than as a template with
    // a name slotted into every row.
    const handle = creditorHandles.length && random() < 0.34 ? pick(creditorHandles, random) : null;

    out.push({
      item: fit(`${thing.item} ${place}`, MAX_ITEM_CHARS, thing.item),
      note: fit(
        handle ? `@${handle} covered it. ${excuse}` : excuse,
        MAX_NOTE_CHARS,
        'Never settled.',
      ),
      category: DEBT_CATEGORIES.includes(thing.category) ? thing.category : 'other',
      amountCents: sampleDebtCents(random),
    });
  }
  return out;
}

/** Exported for the tests: how many distinct openings the banks can produce. */
export const FALLBACK_VARIETY = THINGS.length * PLACES.length * EXCUSES.length;
