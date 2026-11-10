import { describe, expect, it } from 'vitest';
import {
  CITY_EVENTS,
  CITY_EVENT_IDS,
  DAY_TICKS,
  DEFAULT_TAX_RATE,
  EVENT_CHANCE,
  EVENT_MIN_DAY,
  EVENT_MIN_POPULATION,
  MAX_TAX_RATE,
  MIN_TAX_RATE,
  TAX_PER_RESIDENT,
  type CityEventId,
} from '../../content';
import {
  createWorld,
  drawCityEvent,
  eventEffects,
  packCell,
  recomputeCity,
  stepWorld,
  taxDesirability,
  taxHappiness,
  touchCity,
  worldHash,
  type World,
  type WorldEvent,
} from '..';
import { decodeWorld, encodeWorld } from '../../save';
import { buildFirstTown, mid, rejects, run, ticks, townWorld } from './town';
import { P } from './arena';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/** The first town, grown until it can hold the people events need (cells edited directly, like a save would). */
function bigTown(seed = 1): World {
  const w = townWorld(32, seed);
  buildFirstTown(w);
  ticks(w, 3000);
  for (let i = 0; i < w.city.cells.length; i++) {
    if (((w.city.cells[i] >> 1) & 3) === 1) w.city.cells[i] = packCell({ zone: 'homes', level: 3 });
  }
  w.city.population = 30;
  touchCity(w);
  recomputeCity(w);
  expect(w.city.stats.housing).toBeGreaterThanOrEqual(EVENT_MIN_POPULATION);
  return w;
}

/** Put the world one tick before the close of the town day `day` (so the next step settles it). */
function justBeforeCloseOf(w: World, day: number): void {
  w.city.day = day - 1;
  w.tick = day * DAY_TICKS - 1;
}

/** The first town day (from the minimum) on which this world's draw yields an event. */
function eventDay(w: World, from = EVENT_MIN_DAY): number {
  for (let d = from; d < from + 400; d++) if (drawCityEvent(w, d)) return d;
  throw new Error('no event day found');
}

describe('tax rate', () => {
  it('the default rate reproduces the old income exactly (same figures as before the rate existed)', () => {
    const w = townWorld(32, 1);
    buildFirstTown(w);
    expect(w.city.taxRate).toBe(DEFAULT_TAX_RATE);
    // Pinned from the simulation before the tax rate and events existed (no event can occur this early).
    const golden: [number, { pop: number; h: number; tax: number; trade: number; net: number }][] =
      [
        [1500, { pop: 3, h: 38, tax: 3, trade: 0, net: -1 }],
        [3000, { pop: 8, h: 57, tax: 10, trade: 8, net: 14 }],
        [4500, { pop: 12, h: 52, tax: 15, trade: 8, net: 19 }],
        [6000, { pop: 16, h: 49, tax: 19, trade: 8, net: 23 }],
        [7500, { pop: 19, h: 48, tax: 23, trade: 11, net: 30 }],
        [9000, { pop: 21, h: 46, tax: 25, trade: 16, net: 37 }],
      ];
    let at = 0;
    for (const [t, want] of golden) {
      ticks(w, t - at);
      at = t;
      const s = w.city.stats;
      expect({
        pop: w.city.population,
        h: s.happiness,
        tax: s.tax,
        trade: s.trade,
        net: s.net,
      }).toEqual(want);
      // …and the formula it always was.
      expect(s.tax).toBe(
        Math.round(w.city.population * TAX_PER_RESIDENT * (0.6 + 0.4 * (s.happiness / 100))),
      );
    }
    expect(w.city.event).toBeNull();
  });

  it('the default rate is neutral for happiness and move-in', () => {
    expect(taxHappiness(DEFAULT_TAX_RATE)).toBe(0);
    expect(taxDesirability(DEFAULT_TAX_RATE)).toBe(0);
  });

  it('higher rates earn more per resident but cost happiness and move-in (all monotonic)', () => {
    const base = bigTown();
    const seen: { tax: number; happiness: number }[] = [];
    for (let r = MIN_TAX_RATE; r <= MAX_TAX_RATE; r++) {
      const w = clone(base);
      w.city.taxRate = r;
      recomputeCity(w);
      seen.push({ tax: w.city.stats.tax, happiness: w.city.stats.happiness });
    }
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i].tax).toBeGreaterThanOrEqual(seen[i - 1].tax);
      expect(seen[i].happiness).toBeLessThanOrEqual(seen[i - 1].happiness);
      expect(taxDesirability(i + MIN_TAX_RATE)).toBeLessThan(taxDesirability(i - 1 + MIN_TAX_RATE));
    }
    expect(seen[0].tax).toBe(0); // no tax, no money
    expect(seen[MAX_TAX_RATE].tax).toBeGreaterThan(seen[DEFAULT_TAX_RATE].tax);
    expect(seen[0].happiness).toBeGreaterThan(seen[DEFAULT_TAX_RATE].happiness);
    expect(seen[MAX_TAX_RATE].happiness).toBeLessThan(seen[DEFAULT_TAX_RATE].happiness);
  });

  it('low taxes draw people in and high taxes drive them off (town size after a few minutes)', () => {
    const base = bigTown();
    base.city.population = 12;
    recomputeCity(base);
    const after = (rate: number) => {
      const w = clone(base);
      w.city.taxRate = rate;
      touchCity(w);
      ticks(w, 2000);
      return w.city.population;
    };
    const low = after(MIN_TAX_RATE);
    const mid_ = after(DEFAULT_TAX_RATE);
    const high = after(MAX_TAX_RATE);
    expect(low).toBeGreaterThan(mid_);
    expect(mid_).toBeGreaterThanOrEqual(high);
  });

  it('is set by setTaxRate, by anyone, and the change is announced once', () => {
    const w = townWorld();
    const ev = run(w, { type: 'setTaxRate', rate: 14 });
    expect(rejects(ev)).toEqual([]);
    expect(w.city.taxRate).toBe(14);
    expect(ev).toContainEqual({
      type: 'taxRateSet',
      playerId: P,
      rate: 14,
      from: DEFAULT_TAX_RATE,
    });
    // The same rate again is a quiet no-op.
    const again = run(w, { type: 'setTaxRate', rate: 14 });
    expect(again.filter((e) => e.type === 'taxRateSet' || e.type === 'rejected')).toEqual([]);
    // Limits are inclusive.
    expect(rejects(run(w, { type: 'setTaxRate', rate: MIN_TAX_RATE }))).toEqual([]);
    expect(rejects(run(w, { type: 'setTaxRate', rate: MAX_TAX_RATE }))).toEqual([]);
    expect(w.city.taxRate).toBe(MAX_TAX_RATE);
  });

  it('refuses rates that are not whole percents inside the range, changing nothing', () => {
    const w = townWorld();
    for (const rate of [MAX_TAX_RATE + 1, MIN_TAX_RATE - 1, 9.5, Number.NaN, Infinity, 1e9]) {
      const ev = run(w, { type: 'setTaxRate', rate });
      expect(rejects(ev)).toEqual(['bad-amount']);
      expect(ev).toContainEqual({
        type: 'rejected',
        command: 'setTaxRate',
        playerId: P,
        reason: 'bad-amount',
      });
    }
    expect(rejects(run(w, { type: 'setTaxRate', rate: '9' as unknown as number }))).toEqual([
      'bad-amount',
    ]);
    expect(w.city.taxRate).toBe(DEFAULT_TAX_RATE);
  });

  it('a rate change refreshes the figures at once, and changes the settled day', () => {
    const w = bigTown();
    const before = w.city.stats.tax;
    run(w, { type: 'setTaxRate', rate: 16 });
    expect(w.city.dirty).toBe(false);
    expect(w.city.stats.tax).toBeGreaterThan(before);
  });
});

describe('town events: the draw', () => {
  it('is a pure function of (seed, day, town): same world and day, same answer, whatever the rng says', () => {
    const w = bigTown();
    const days = Array.from({ length: 300 }, (_, i) => EVENT_MIN_DAY + i);
    const first = days.map((d) => drawCityEvent(w, d));
    const rng = w.rng;
    w.rng = 12345;
    w.accMs = 17;
    expect(days.map((d) => drawCityEvent(w, d))).toEqual(first);
    w.rng = rng;
    expect(clone(w) && days.map((d) => drawCityEvent(clone(w), d))).toEqual(first);
    // Drawing does not consume or change anything.
    const h = worldHash(w);
    days.forEach((d) => drawCityEvent(w, d));
    expect(worldHash(w)).toBe(h);
  });

  it('differs between seeds, and is rare: about EVENT_CHANCE of days, every kind turns up, none before the grace', () => {
    const w = bigTown();
    let started = 0;
    const kinds = new Set<CityEventId>();
    const N = 4000;
    for (let d = EVENT_MIN_DAY; d < EVENT_MIN_DAY + N; d++) {
      const id = drawCityEvent(w, d);
      if (id) {
        started++;
        kinds.add(id);
      }
    }
    expect(started / N).toBeGreaterThan(EVENT_CHANCE * 0.8);
    expect(started / N).toBeLessThan(EVENT_CHANCE * 1.2);
    expect([...kinds].sort()).toEqual([...CITY_EVENT_IDS].sort());
    for (let d = 0; d < EVENT_MIN_DAY; d++) expect(drawCityEvent(w, d)).toBeNull();
    const other = bigTown(5);
    other.seed = w.seed + 1;
    const a = Array.from({ length: 200 }, (_, i) => drawCityEvent(w, EVENT_MIN_DAY + i));
    const b = Array.from({ length: 200 }, (_, i) => drawCityEvent(other, EVENT_MIN_DAY + i));
    expect(b).not.toEqual(a);
  });

  it('waits for a town of EVENT_MIN_POPULATION residents', () => {
    const w = bigTown();
    const d = eventDay(w);
    w.city.population = EVENT_MIN_POPULATION - 1;
    expect(drawCityEvent(w, d)).toBeNull();
    w.city.population = EVENT_MIN_POPULATION;
    expect(drawCityEvent(w, d)).not.toBeNull();
  });

  it('never draws a storm for a town with no power, or a dry spell for one with no water', () => {
    const w = bigTown();
    const seen = (stats: Partial<World['city']['stats']>) => {
      const x = clone(w);
      Object.assign(x.city.stats, stats);
      const out = new Set<CityEventId | null>();
      for (let d = EVENT_MIN_DAY; d < 3000; d++) out.add(drawCityEvent(x, d));
      return out;
    };
    expect(seen({ powerSupply: 0 }).has('storm')).toBe(false);
    expect(seen({ waterSupply: 0 }).has('drySpell')).toBe(false);
    expect(seen({}).has('storm')).toBe(true);
    expect(seen({}).has('drySpell')).toBe(true);
  });
});

describe('town events: what they do', () => {
  const withEvent = (w: World, id: CityEventId | null) => {
    const x = clone(w);
    x.city.event = id ? { id, since: x.city.day, daysLeft: CITY_EVENTS[id].days } : null;
    recomputeCity(x);
    return x.city.stats;
  };

  it('is neutral with no event', () => {
    expect(eventEffects({ event: null })).toEqual({
      happiness: 0,
      power: 1,
      water: 1,
      trade: 1,
      tax: 1,
    });
  });

  it('festival lifts happiness and trade; market fair lifts trade; harvest lifts taxes', () => {
    const w = bigTown();
    const base = withEvent(w, null);
    const fest = withEvent(w, 'festival');
    expect(fest.happiness).toBeGreaterThan(base.happiness);
    expect(fest.trade).toBe(Math.round(base.trade * CITY_EVENTS.festival.trade));
    const fair = withEvent(w, 'tradeFair');
    expect(fair.trade).toBe(Math.round(base.trade * CITY_EVENTS.tradeFair.trade));
    expect(fair.trade).toBeGreaterThan(base.trade);
    expect(fair.happiness).toBe(base.happiness);
    const harvest = withEvent(w, 'harvest');
    expect(harvest.tax).toBeGreaterThan(base.tax);
    expect(harvest.net).toBeGreaterThan(base.net);
  });

  it('a storm cuts power supply and a dry spell cuts water supply, partially', () => {
    const w = bigTown();
    const base = withEvent(w, null);
    expect(base.powerSupply).toBeGreaterThan(0);
    const storm = withEvent(w, 'storm');
    expect(storm.powerSupply).toBeLessThan(base.powerSupply);
    expect(storm.powerSupply).toBeGreaterThan(0);
    expect(storm.powerSupply).toBe(Math.floor(12 * CITY_EVENTS.storm.power));
    expect(storm.waterSupply).toBe(base.waterSupply);
    expect(storm.powerCover).toBeLessThanOrEqual(base.powerCover);
    const dry = withEvent(w, 'drySpell');
    expect(dry.waterSupply).toBeLessThan(base.waterSupply);
    expect(dry.waterSupply).toBeGreaterThan(0);
    expect(dry.powerSupply).toBe(base.powerSupply);
    expect(dry.waterCover).toBeLessThanOrEqual(base.waterCover);
  });

  it('no event takes more than 40% of any supply, lasts more than 3 days, or boosts anything past 1.5x', () => {
    for (const id of CITY_EVENT_IDS) {
      const e = CITY_EVENTS[id];
      expect(e.power).toBeGreaterThanOrEqual(0.6);
      expect(e.water).toBeGreaterThanOrEqual(0.6);
      expect(e.days).toBeGreaterThanOrEqual(1);
      expect(e.days).toBeLessThanOrEqual(3);
      expect(Math.max(e.trade, e.tax)).toBeLessThanOrEqual(1.5);
      expect(e.weight).toBeGreaterThan(0);
    }
  });
});

describe('town events: start, last, end', () => {
  /** Step the world through the close of `day`, returning that step's events. */
  const closeDay = (w: World, day: number): WorldEvent[] => {
    justBeforeCloseOf(w, day);
    return stepWorld(w, 50);
  };

  it('starts the drawn event at the close of a day, applies it, and ends it after its length', () => {
    const w = bigTown();
    const d = eventDay(w);
    const id = drawCityEvent(w, d)!;
    const ev = closeDay(w, d);
    expect(ev).toContainEqual({ type: 'cityEventStarted', id, day: d, days: CITY_EVENTS[id].days });
    expect(w.city.event).toEqual({ id, since: d, daysLeft: CITY_EVENTS[id].days });
    expect(w.city.dirty).toBe(false);
    // Its modifiers are in the figures while it lasts…
    expect(eventEffects(w.city)).toEqual(
      expect.objectContaining({
        happiness: CITY_EVENTS[id].happiness,
        trade: CITY_EVENTS[id].trade,
        tax: CITY_EVENTS[id].tax,
      }),
    );
    // …only one runs at a time, however many days draw an event…
    const length = CITY_EVENTS[id].days;
    const ends: number[] = [];
    let starts = 0;
    for (let k = 1; k <= length; k++) {
      const out = closeDay(w, d + k);
      starts += out.filter((e) => e.type === 'cityEventStarted').length;
      if (out.some((e) => e.type === 'cityEventEnded')) ends.push(d + k);
      if (k < length) expect(w.city.event?.id).toBe(id);
    }
    // …and it ended exactly `length` closes later, with the figures neutral again.
    expect(starts).toBe(0);
    expect(ends).toEqual([d + length]);
    expect(w.city.event).toBeNull();
    expect(eventEffects(w.city)).toEqual({ happiness: 0, power: 1, water: 1, trade: 1, tax: 1 });
  });

  it('starts no event in a town that is too small or too young, and none while one is on', () => {
    const small = bigTown();
    const d = eventDay(small);
    // No homes, so nobody can live here: the town stays under the bar through the close.
    for (let i = 0; i < small.city.cells.length; i++) {
      if (((small.city.cells[i] >> 1) & 3) === 1) small.city.cells[i] = 0;
    }
    small.city.population = 0;
    touchCity(small);
    expect(closeDay(small, d).filter((e) => e.type === 'cityEventStarted')).toEqual([]);
    expect(small.city.event).toBeNull();

    const busy = bigTown();
    const d2 = eventDay(busy);
    busy.city.event = { id: 'festival', since: 0, daysLeft: 5 }; // longer than any real one: outlasts the draws
    const out = closeDay(busy, d2);
    expect(out.filter((e) => e.type === 'cityEventStarted')).toEqual([]);
    expect(busy.city.event).toEqual({ id: 'festival', since: 0, daysLeft: 4 });
  });

  it('a storm or dry spell never costs the town a resident (nobody leaves while it lasts)', () => {
    for (const id of ['storm', 'drySpell'] as const) {
      const w = bigTown();
      w.city.event = { id, since: w.city.day, daysLeft: CITY_EVENTS[id].days };
      touchCity(w);
      recomputeCity(w);
      const before = w.city.population;
      ticks(w, 2400); // two days: six move-in/move-out rounds with the supply cut
      expect(w.city.population).toBeGreaterThanOrEqual(before);
    }
  });

  it('draws nothing from the rng: world.rng is the same with or without the event machinery running', () => {
    const w = bigTown();
    const d = eventDay(w);
    const mark = w.rng;
    closeDay(w, d);
    expect(w.city.event).not.toBeNull();
    expect(w.rng).toBe(mark);
  });

  it('is replayed identically from the same commands, across a JSON round trip, with events and rate changes', () => {
    const play = (resumeFrom?: World) => {
      const w = resumeFrom ?? bigTown();
      const out: WorldEvent[] = [];
      for (let i = 0; i < 40; i++) {
        out.push(...ticks(w, 600));
        if (i === 5) out.push(...run(w, { type: 'setTaxRate', rate: 13 }));
        if (i === 15) out.push(...run(w, { type: 'setTaxRate', rate: 5 }));
      }
      return { w, out };
    };
    const a = play();
    const b = play();
    expect(worldHash(a.w)).toBe(worldHash(b.w));
    expect(JSON.stringify(a.out)).toBe(JSON.stringify(b.out));
    expect(a.out.some((e) => e.type === 'cityEventStarted')).toBe(true);
    expect(a.out.some((e) => e.type === 'cityEventEnded')).toBe(true);
  }, 60_000);

  it('a checkpoint taken mid-event resumes to the same world as the original', () => {
    const w = bigTown();
    const d = eventDay(w);
    closeDay(w, d);
    expect(w.city.event).not.toBeNull();
    ticks(w, 300);
    const copy = clone(w);
    const saved = decodeWorld(encodeWorld(w)); // the P2P snapshot / save path
    expect(worldHash(copy)).toBe(worldHash(w));
    expect(worldHash(saved)).toBe(worldHash(w));
    expect(saved.city.event).toEqual(w.city.event);
    ticks(w, 6000);
    ticks(copy, 6000);
    ticks(saved, 6000);
    expect(worldHash(copy)).toBe(worldHash(w));
    expect(worldHash(saved)).toBe(worldHash(w));
  }, 60_000);
});

describe('a new world', () => {
  it('starts at the default rate with no event', () => {
    const w = createWorld(1, 16);
    expect(w.city.taxRate).toBe(DEFAULT_TAX_RATE);
    expect(w.city.event).toBeNull();
    expect(mid(w)).toBe(8);
  });
});
