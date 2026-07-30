/**
 * Trophies — and, through Devotion, the thing that actually multiplies your
 * income.
 *
 * Every non-shadow trophy is worth 4% Devotion, and the Cherub blessings turn
 * Devotion into a global multiplier. So this list is not decoration: it is the
 * late game's difficulty curve, and the reason a player who has "finished"
 * still has three hundred hours of reasons to keep opening the tab.
 *
 * Most of it is generated — a hand-written list of four hundred rows is a list
 * with four hundred typos in it — but the ones a player is likely to *read*
 * are written out.
 */
import type { TrophyDef } from '../types';
import { SOURCES } from './sources';
import { fmt } from '../numbers';

/* ── Owning things ───────────────────────────────────────────────────────── */

/** Copy counts that earn a trophy, per source. */
export const OWN_TIERS = [1, 10, 25, 50, 100, 150, 200, 250, 300, 350, 400, 450];

const OWN_TITLES = [
  'A Beginning', 'In Earnest', 'A Going Concern', 'Established', 'Renowned',
  'Institutional', 'Unignorable', 'Legendary', 'Mythic', 'Absurd',
  'Beyond Excuse', 'Simply Too Many',
];

function ownTrophies(): TrophyDef[] {
  const out: TrophyDef[] = [];
  for (const source of SOURCES) {
    OWN_TIERS.forEach((count, i) => {
      out.push({
        id: `own_${source.id}_${count}`,
        name: `${OWN_TITLES[i]!}: ${source.name}`,
        description: `Own ${count.toLocaleString('en-US')} ${source.name}${count === 1 ? '' : 's'}.`,
        flavor:
          i === 0
            ? `The first one is always the strangest purchase.`
            : i >= 9
              ? `Nobody has asked you to stop, which is its own kind of answer.`
              : `${source.verb.charAt(0).toUpperCase()}${source.verb.slice(1)}, at scale.`,
      });
    });
  }
  return out;
}

/* ── Making joy ──────────────────────────────────────────────────────────── */

const JOY_TIERS = [
  1e3, 1e5, 1e6, 1e8, 1e9, 1e11, 1e12, 1e14, 1e15, 1e17, 1e18, 1e21, 1e24, 1e27,
  1e30, 1e33, 1e36, 1e39, 1e42, 1e45, 1e48, 1e54, 1e60, 1e66, 1e72, 1e78, 1e84,
  1e90, 1e96, 1e102, 1e120, 1e150, 1e180, 1e210,
];

const JOY_TITLES = [
  'A Good Day', 'A Good Week', 'A Good Year', 'Contentment', 'Gladness',
  'Delight', 'Elation', 'Rapture, Small', 'Rapture, Medium', 'Rapture, Large',
  'Bliss', 'Beatitude', 'Exultation', 'Jubilee', 'Transport',
  'Ecstasy', 'Consolation', 'Sweetness', 'The Long Gladness', 'Overwhelm',
  'Sufficiency', 'Overflow', 'Cup Running Over', 'The Full Measure',
  'Pressed Down and Shaken Together', 'Immoderate', 'Unreasonable',
  'Frankly Excessive', 'Structurally Joyful', 'Joy as a Building Material',
  'The Load-Bearing Gladness', 'Nothing But This', 'It Is All Joy Now',
  'And Still It Continues',
];

function joyTrophies(): TrophyDef[] {
  return JOY_TIERS.map((threshold, i) => ({
    id: `joy_${i}`,
    name: JOY_TITLES[i] ?? `Joy ${i}`,
    description: `Make ${fmt(threshold)} joy in one lifetime.`,
    flavor:
      i < 4
        ? 'It counts. All of it counts.'
        : i < 15
          ? 'The number stopped meaning anything a while ago. The feeling did not.'
          : 'There is no unit for this. There does not need to be.',
  }));
}

/* ── Everything else ─────────────────────────────────────────────────────── */

const HANDMADE: TrophyDef[] = [
  // Touch
  { id: 'touch_100', name: 'A Hundred Offerings', description: 'Offer joy by hand 100 times.', flavor: 'The gesture is starting to feel like yours.' },
  { id: 'touch_1000', name: 'A Thousand Offerings', description: 'Offer joy by hand 1,000 times.', flavor: 'Your wrist has an opinion. Ignore it.' },
  { id: 'touch_10000', name: 'Ten Thousand Offerings', description: 'Offer joy by hand 10,000 times.', flavor: 'Malcolm Gladwell would like a word.' },
  { id: 'touch_100000', name: 'A Hundred Thousand Offerings', description: 'Offer joy by hand 100,000 times.', flavor: 'You have worn a small hollow into the stone.' },
  { id: 'touch_1000000', name: 'A Million Offerings', description: 'Offer joy by hand 1,000,000 times.', flavor: 'Please consider a stretch.' },
  { id: 'fervour', name: 'Fervour', description: 'Offer 15 times in three seconds.', flavor: 'Something has come over you and it is welcome here.' },

  // Halos
  { id: 'halo_1', name: 'Caught the Light', description: 'Catch your first halo.', flavor: 'It was there the whole time, out of the corner of your eye.' },
  { id: 'halo_10', name: 'Attentive', description: 'Catch 10 halos.', flavor: 'You have started scanning the room.' },
  { id: 'halo_50', name: 'Watchful', description: 'Catch 50 halos.', flavor: 'Providence has noticed that you notice.' },
  { id: 'halo_200', name: 'Nothing Gets Past You', description: 'Catch 200 halos.', flavor: 'Not one of them has landed unwitnessed.' },
  { id: 'halo_1000', name: 'Expected, Now', description: 'Catch 1,000 halos.', flavor: 'You would be a little hurt if one did not come.' },
  { id: 'halo_streak', name: 'Not One Missed', description: 'Catch 20 halos in a row without letting one fade.', flavor: 'Some people have a gift. You have a habit.' },
  { id: 'halo_seraphic', name: 'The Bright One', description: 'Catch a seraphic halo.', flavor: 'Too much of it. Exactly the right amount of too much.' },

  // Rapture
  { id: 'rapture_open', name: 'You Opened It', description: 'Begin the Rapture.', flavor: 'Everyone saw you do it. Nobody stopped you.' },
  { id: 'rapture_full', name: 'All the Way', description: 'Reach the third stage of the Rapture.', flavor: 'The temple is louder now, and considerably more profitable.' },
  { id: 'sinner_1', name: 'The First Guest', description: 'Strike a Sinner.', flavor: 'It gave back more than it took. This will become a habit.' },
  { id: 'sinner_100', name: 'A Hundred Reckonings', description: 'Strike 100 Sinners.', flavor: 'You have stopped thinking of them as a problem.' },
  { id: 'sinner_1000', name: 'The Long Reckoning', description: 'Strike 1,000 Sinners.', flavor: 'They queue now. It is unsettling and lucrative.' },
  { id: 'sinner_full', name: 'A Full House', description: 'Have 12 Sinners feeding at once.', flavor: 'Your rate has never looked worse. Your future has never looked better.' },
  { id: 'penitent', name: 'The Penitent One', description: 'Strike a penitent Sinner.', flavor: 'It apologised. Sincerely. And then paid triple.' },
  { id: 'rapture_close', name: 'Enough, For Now', description: 'End the Rapture after starting it.', flavor: 'You closed the window. It stays closed as long as you like.' },

  // Manna
  { id: 'manna_1', name: 'Bread From Nowhere', description: 'Gather your first Manna.', flavor: 'Nobody baked it. Everyone ate.' },
  { id: 'manna_10', name: 'The Gathered Omer', description: 'Gather 10 Manna.', flavor: 'Measured out exactly. It always is.' },
  { id: 'manna_50', name: 'Forty Years of Breakfast', description: 'Gather 50 Manna.', flavor: 'Complaints have been logged and ignored.' },
  { id: 'manna_100', name: 'Daily Bread', description: 'Gather 100 Manna.', flavor: 'You have arranged your life around a twenty-hour cycle.' },
  { id: 'manna_gilded', name: 'The Gilded Loaf', description: 'Gather a gilded Manna.', flavor: 'Worth several. Tastes like being early.' },
  { id: 'level_10', name: 'Raised Up', description: 'Reach 10 total Manna levels across your sources.', flavor: 'Slow work. The best kind.' },
  { id: 'level_50', name: 'Well Raised', description: 'Reach 50 total Manna levels.', flavor: 'Months of patience, compressed into one number.' },
  { id: 'level_100', name: 'The Long Patience', description: 'Reach 100 total Manna levels.', flavor: 'You have been here a while. It shows, beautifully.' },

  // Garden
  { id: 'garden_open', name: 'Break the Ground', description: 'Open the Garden of Eden.', flavor: 'The first bed. It looks like nothing yet.' },
  { id: 'garden_harvest', name: 'First Fruits', description: 'Harvest a ripe plant.', flavor: 'You waited. That was the whole skill.' },
  { id: 'garden_cross', name: 'Something New', description: 'Discover a seed by crossbreeding.', flavor: 'Neither parent would recognise it.' },
  { id: 'garden_half', name: 'The Botanist', description: 'Discover 8 kinds of seed.', flavor: 'You have started keeping notes.' },
  { id: 'garden_all', name: 'The Whole Garden', description: 'Discover every seed.', flavor: 'Including the one nobody was supposed to find.' },
  { id: 'garden_tree', name: 'The Tree of Life', description: 'Grow the Tree of Life to maturity.', flavor: 'It was in the garden the whole time. You just had to arrange the rest of it correctly.' },
  { id: 'garden_full', name: 'Every Bed Planted', description: 'Fill all 36 plots at once.', flavor: 'Not one square of it wasted.' },
  { id: 'garden_grace', name: 'Soil of Grace', description: 'Till the garden with soil of grace.', flavor: 'Nothing has to try very hard here.' },

  // Choir
  { id: 'choir_open', name: 'Seat the Choir', description: 'Open the Choir of Saints.', flavor: 'Three stalls. Twelve applicants. Endless opinions.' },
  { id: 'choir_full', name: 'All Three Stalls', description: 'Seat a saint in every stall.', flavor: 'The harmony is immediate and slightly smug.' },
  { id: 'choir_swap', name: 'Reconsidered', description: 'Re-seat the choir 25 times.', flavor: 'They are used to it. They are saints.' },
  { id: 'choir_all', name: 'The Full Calendar', description: 'Seat all twelve saints at least once.', flavor: 'Everyone gets a turn. Even Jerome.' },

  // Exchange
  { id: 'exchange_open', name: 'Open the Books', description: 'Open the Indulgence Exchange.', flavor: 'Charity, but with a spread.' },
  { id: 'exchange_profit', name: 'In the Black', description: 'Turn a profit on the Exchange.', flavor: 'Bought low. Absolved high.' },
  { id: 'exchange_big', name: 'The Good Trade', description: 'Clear a single trade worth an hour of your rate.', flavor: 'You watched it for six days and moved once.' },
  { id: 'exchange_all', name: 'Diversified', description: 'Hold every good at once.', flavor: 'The portfolio of a person with a system.' },
  { id: 'exchange_crash', name: 'Bought the Bottom', description: 'Buy a good at under a tenth of its base price.', flavor: 'Everybody else was selling. That was the signal.' },
  { id: 'exchange_fortune', name: 'A Fortune in Absolution', description: 'Make a lifetime profit worth a day of your rate.', flavor: 'The almshouse has never been richer, which it finds hilarious.' },

  // Hours
  { id: 'hours_open', name: 'Open the Book', description: 'Open the Book of Hours.', flavor: 'The ink is still wet. It has been for centuries.' },
  { id: 'hours_first', name: 'Said the Words', description: 'Say your first prayer.', flavor: 'Something, somewhere, made a note.' },
  { id: 'hours_100', name: 'A Hundred Hours', description: 'Say 100 prayers.', flavor: 'The book knows your handwriting now.' },
  { id: 'hours_backfire', name: 'It Went Wrong', description: 'Have a prayer backfire.', flavor: 'Answered. Just not in the way you had drafted.' },
  { id: 'hours_hand', name: 'Force the Hand', description: 'Summon a halo with a prayer.', flavor: 'Providence, requested by name. Slightly affronted.' },
  { id: 'hours_edifice', name: 'Built in an Instant', description: 'Raise a source out of nothing with a prayer.', flavor: 'The masons are furious.' },

  // Ascension
  { id: 'ascend_1', name: 'Let It Go', description: 'Ascend for the first time.', flavor: 'You gave the whole thing back and were handed something better.' },
  { id: 'ascend_5', name: 'Again', description: 'Ascend 5 times.', flavor: 'The climb is familiar now, and much faster.' },
  { id: 'ascend_25', name: 'The Practised Ascent', description: 'Ascend 25 times.', flavor: 'You could do this in your sleep. Sometimes you do.' },
  { id: 'ascend_100', name: 'A Hundred Departures', description: 'Ascend 100 times.', flavor: 'Every one of them left something behind that stayed.' },
  { id: 'grace_100', name: 'A Hundred Graces', description: 'Hold 100 Grace at once.', flavor: 'Unspent, and therefore full of futures.' },
  { id: 'grace_10000', name: 'Ten Thousand Graces', description: 'Hold 10,000 Grace at once.', flavor: 'The ladder goes further up than it looked from the ground.' },
  { id: 'legacy_half', name: 'Halfway Up', description: 'Buy half of the Ladder.', flavor: 'Each rung was somebody’s whole week.' },
  { id: 'legacy_all', name: 'The Whole Ladder', description: 'Buy every rung of the Ladder.', flavor: 'You are at the top of it, looking at the next one.' },

  // Time
  { id: 'time_1h', name: 'An Hour Here', description: 'Spend an hour in the temple.', flavor: 'It went quickly.' },
  { id: 'time_10h', name: 'Ten Hours', description: 'Spend ten hours in the temple.', flavor: 'It is starting to feel like somewhere you live.' },
  { id: 'time_100h', name: 'A Hundred Hours', description: 'Spend a hundred hours in the temple.', flavor: 'You know where everything is without looking.' },
  { id: 'time_250h', name: 'Two Hundred and Fifty Hours', description: 'Spend 250 hours in the temple.', flavor: 'This was always the number. Welcome.' },
  { id: 'time_500h', name: 'Five Hundred Hours', description: 'Spend 500 hours in the temple.', flavor: 'Nothing left to prove. Everything left to enjoy.' },
  { id: 'time_1000h', name: 'A Thousand Hours', description: 'Spend a thousand hours in the temple.', flavor: 'The temple has begun keeping *you*.' },
  { id: 'vigil_long', name: 'The Long Absence', description: 'Return after a full day away.', flavor: 'It kept going. It always keeps going.' },

  // Secret
  { id: 'secret_patience', name: 'Never Touched It', description: 'Make a trillion joy without offering by hand.', flavor: 'You never once reached out. It came anyway.', secret: true },
  { id: 'secret_frugal', name: 'The Bare Altar', description: 'Reach a billion joy with no blessings bought.', flavor: 'A stubbornness bordering on doctrine.', secret: true },
  { id: 'secret_singular', name: 'One of Everything', description: 'Own exactly one of all 24 sources at once.', flavor: 'A collector, not a builder.', secret: true },
  { id: 'secret_empty', name: 'Emptied', description: 'Spend down to zero joy while making more than a billion a second.', flavor: 'Nothing in hand. Everything on the way.', secret: true },
  { id: 'secret_dawn', name: 'Both Lights', description: 'See the temple in dawn and in vespers.', flavor: 'Same building. Entirely different room.', secret: true },
  { id: 'secret_nothing', name: 'Sat With It', description: 'Leave the temple open, untouched, for an hour.', flavor: 'You did nothing at all, on purpose. It counted.', secret: true },

  // Shadow — showing off. Excluded from Devotion.
  { id: 'shadow_speed', name: 'Unseemly Haste', description: 'Ascend within ten minutes of a fresh run.', flavor: 'Impressive. Slightly joyless.', secret: true, shadow: true },
  { id: 'shadow_hoard', name: 'Hoarder', description: 'Hold a thousand of a single source.', flavor: 'There is no upgrade for this. That was never the point.', secret: true, shadow: true },
  { id: 'shadow_all_seeds', name: 'The Complete Herbal', description: 'Discover every seed without ever letting one wither.', flavor: 'Nobody asked for this level of care. It was given anyway.', secret: true, shadow: true },
];

/* ── Assembly ────────────────────────────────────────────────────────────── */

export const TROPHIES: TrophyDef[] = [...ownTrophies(), ...joyTrophies(), ...HANDMADE];

export const TROPHY_MAP: Record<string, TrophyDef> = Object.fromEntries(
  TROPHIES.map((t) => [t.id, t]),
);

/** Trophies that count toward Devotion. Shadow trophies do not. */
export const DEVOTION_TROPHIES = new Set(TROPHIES.filter((t) => !t.shadow).map((t) => t.id));

/** Joy thresholds, exported so the tick can check them without a rebuild. */
export const JOY_TROPHY_TIERS = JOY_TIERS;

/** Devotion granted per qualifying trophy. Cookie Clicker's milk, renamed. */
export const DEVOTION_PER_TROPHY = 0.04;
