/* eslint-disable no-console -- a command-line report */
/**
 * Hearthworks crime/police balance harness. Runs many seeded simulations of scripted players against the real
 * police and prints the distributions the design targets (docs/hearthworks-balance.md) are written in.
 *
 *   pnpm exec tsx scripts/hearthworks/balance.ts                 # everything, 24 seeds
 *   pnpm exec tsx scripts/hearthworks/balance.ts --seeds 8       # quicker
 *   pnpm exec tsx scripts/hearthworks/balance.ts --only guns,heat
 *   pnpm exec tsx scripts/hearthworks/balance.ts --out balance.json
 *
 * Not part of the default test run. The regression tests in lib/hearthworks/world/__tests__/balance.test.ts pin
 * the invariants this reports on. Same seeds, same numbers: the sim is deterministic.
 */

import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import {
  CROPS,
  ITEMS,
  OFFICER_KINDS,
  OFFICERS,
  RECIPES,
  WEAPONS,
  WEAPON_IDS,
  type OfficerKind,
} from '../../lib/hearthworks/content';
import {
  HEAT_DECAY_TICKS,
  HUSTLE_MARKUP,
  MAX_OFFICERS,
  START_MONEY,
  TICK_MS,
  WANTED_HEAT,
  placeOfficer,
  stepWorld,
} from '../../lib/hearthworks/world';
import {
  duelKill,
  farmer,
  fight,
  gunman,
  hustler,
  makeRng,
  newScene,
  rate,
  run,
  secs,
  summarize,
  type RunLog,
  type Summary,
} from '../../lib/hearthworks/world/__tests__/balance-sim';

// ---------------------------------------------------------------------------------------------------------------
// Arguments.

const argv = process.argv.slice(2);
const arg = (name: string, dflt: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const SEEDS = Number(arg('seeds', '24'));
/** Island size: the game's default is 32; the city layer may grow it. */
const SIZE = Number(arg('size', '32'));
const ONLY = new Set(arg('only', '').split(',').filter(Boolean));
const OUT = arg('out', 'hearthworks-balance.json');
const want = (k: string) => ONLY.size === 0 || ONLY.has(k);
const seeds = Array.from({ length: SEEDS }, (_, i) => i + 1);

// ---------------------------------------------------------------------------------------------------------------
// Output helpers.

const report: Record<string, unknown> = {
  generated: 'deterministic',
  seeds: SEEDS,
  tickMs: TICK_MS,
};

const f1 = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : '-');
const pct = (n: number) => (Number.isFinite(n) ? `${Math.round(n * 100)}%` : '-');

function table(title: string, head: string[], rows: (string | number)[][]) {
  console.log(`\n## ${title}\n`);
  const all = [head, ...rows.map((r) => r.map(String))];
  const widths = head.map((_, i) => Math.max(...all.map((r) => (r[i] ?? '').length)));
  const line = (r: string[]) => `| ${r.map((c, i) => c.padEnd(widths[i])).join(' | ')} |`;
  console.log(line(head));
  console.log(`|${widths.map((x) => '-'.repeat(x + 2)).join('|')}|`);
  for (const r of all.slice(1)) console.log(line(r));
}

const dist = (s: Summary, unit = 's') => `${f1(s.p50)}${unit} (${f1(s.p10)}–${f1(s.p90)})`;
const known = (xs: (number | null)[]) => xs.filter((x): x is number => x !== null);
const sec = (xs: (number | null)[]) => summarize(known(xs).map(secs));

// ---------------------------------------------------------------------------------------------------------------
// 1. Economy: what each route pays, before any police.

if (want('economy')) {
  const rows: (string | number)[][] = [];
  const cropPerSec = (id: keyof typeof CROPS) => {
    const c = CROPS[id];
    return (ITEMS[c.yieldItem].price * c.yieldQty - c.seedPrice) / ((c.stages * c.stageMs) / 1000);
  };
  const best = (Object.keys(CROPS) as (keyof typeof CROPS)[]).reduce((a, b) =>
    cropPerSec(a) > cropPerSec(b) ? a : b,
  );
  rows.push([
    'farm: best crop per plot',
    `${best}`,
    f1(cropPerSec(best) * 60),
    '/min per plot (stall price)',
  ]);
  for (const [id, r] of Object.entries(RECIPES)) {
    const inputs = Object.entries(r.inputs).reduce(
      (s, [k, n]) => s + ITEMS[k as keyof typeof ITEMS].price * (n ?? 0),
      0,
    );
    const legal = ITEMS[r.output].price;
    const street = Math.floor(legal * HUSTLE_MARKUP);
    rows.push([
      `recipe ${id}`,
      ITEMS[r.output].contraband ? 'contraband' : 'legal',
      `${inputs} in`,
      `stall ${legal} (x${f1(legal / inputs)}) / customer ${Math.floor(legal * 1.5)} / street ${street} (x${f1(street / inputs)})`,
    ]);
  }
  table('Economy per unit', ['route', 'kind', 'input cost / rate', 'return'], rows);

  const logs = seeds.map((s) => run('farmer', farmer(), { seed: s, ticks: 6000, size: SIZE }).log);
  const gain = summarize(logs.map((l) => ((l.moneyEnd - l.moneyStart) / secs(l.ticks)) * 60));
  report.economy = { farmerPerMinute: gain };
  table(
    'Pacifist farmer, 5 min (7 plots of tomato + stall, no crime)',
    ['metric', 'value'],
    [
      ['money gained per minute', dist(gain, '')],
      ['officers ever spawned', Math.max(...logs.map((l) => l.spawned))],
      [
        'customers who came (mean; this policy never serves them)',
        f1(summarize(logs.map((l) => l.customersSeen)).mean),
      ],
      ['max customer stuck counter', Math.max(...logs.map((l) => l.npcStuckMax))],
    ],
  );
}

// ---------------------------------------------------------------------------------------------------------------
// 2. Heat and the first response.

function summariseRuns(title: string, key: string, logs: RunLog[]) {
  const captured = logs.filter((l) => l.arrests + l.downs > 0);
  const lost = logs.map((l) => l.fines + l.confiscatedValue);
  const rows: (string | number)[][] = [
    ['first crime -> heat 40 (wanted)', dist(sec(logs.map((l) => l.heatAt[40])))],
    ['first crime -> heat 100', dist(sec(logs.map((l) => l.heatAt[100])))],
    ['wanted -> first officer on the island', dist(sec(logs.map((l) => l.firstResponse)))],
    ['first officer -> within gun range', dist(sec(logs.map((l) => l.firstContact)))],
    [
      'officers spawned (mean) / killed (mean)',
      `${f1(summarize(logs.map((l) => l.spawned)).mean)} / ${f1(summarize(logs.map((l) => l.killed)).mean)}`,
    ],
    ['runs ending arrested or downed at least once', pct(captured.length / logs.length)],
    ['first crime -> first arrest/down', dist(sec(logs.map((l) => l.firstCapture)))],
    ['cash lost to fines', dist(summarize(logs.map((l) => l.fines)), '')],
    [
      'contraband confiscated (stall value)',
      dist(summarize(logs.map((l) => l.confiscatedValue)), ''),
    ],
    ['hustle income', dist(summarize(logs.map((l) => l.hustleIncome)), '')],
    ['net money change', dist(summarize(logs.map((l) => l.moneyEnd - l.moneyStart)), '')],
    ['last crime -> heat 0', dist(sec(logs.map((l) => l.heatClearTicks)))],
    ['last crime -> police gone', dist(sec(logs.map((l) => l.lawGoneTicks)))],
    ['peak officers at once (max)', Math.max(...logs.map((l) => l.maxOfficers))],
    ['stuck officers (total over runs)', logs.reduce((s, l) => s + l.stuckOfficers, 0)],
    ['lowest health (p50)', f1(summarize(logs.map((l) => l.hpMin)).p50)],
  ];
  table(title, ['metric', 'p50 (p10–p90)'], rows);
  report[key] = {
    heat40: sec(logs.map((l) => l.heatAt[40])),
    response: sec(logs.map((l) => l.firstResponse)),
    contact: sec(logs.map((l) => l.firstContact)),
    capturedRate: captured.length / logs.length,
    firstCapture: sec(logs.map((l) => l.firstCapture)),
    lost: summarize(lost),
    net: summarize(logs.map((l) => l.moneyEnd - l.moneyStart)),
    heatClear: sec(logs.map((l) => l.heatClearTicks)),
    lawGone: sec(logs.map((l) => l.lawGoneTicks)),
    stuck: logs.reduce((s, l) => s + l.stuckOfficers, 0),
    spawned: summarize(logs.map((l) => l.spawned)),
  };
}

const withStock =
  (n: number, money = START_MONEY) =>
  (_w: unknown, p: { inventory: Record<string, number>; money: number }) => {
    p.inventory['mystery-tonic'] = n;
    p.money = money;
  };

if (want('hustler')) {
  const HORIZON = 6000;
  const mk = (name: string, policy: () => ReturnType<typeof hustler>, stock: number) =>
    seeds.map(
      (s) =>
        run(name, policy(), {
          seed: s,
          ticks: HORIZON,
          size: SIZE,
          setup: withStock(stock) as never,
        }).log,
    );
  const scenarios: [string, string, () => ReturnType<typeof hustler>, number][] = [
    [
      'hustlerDeal6Stand',
      'One deal of 6 tonics (heat 44), then stands still',
      () => hustler({ batch: 6, dealBelow: 100, fleeWhen: 0, lieLow: false, maxDeals: 1 }),
      6,
    ],
    [
      'hustlerDeal6Run',
      'One deal of 6 tonics (heat 44), then runs from the law',
      () => hustler({ batch: 6, dealBelow: 100, fleeWhen: 1, lieLow: true, maxDeals: 1 }),
      6,
    ],
    [
      'hustlerDumpStand',
      'Dumper: 20 tonics in one deal (heat 100), stands still',
      () => hustler({ batch: 20, dealBelow: 100, fleeWhen: 0, lieLow: false, maxDeals: 1 }),
      20,
    ],
    [
      'hustlerDumpRun',
      'Dump-and-run: 20 tonics in one deal (heat 100), then runs',
      () => hustler({ batch: 20, dealBelow: 100, fleeWhen: 1, lieLow: true, maxDeals: 1 }),
      20,
    ],
    [
      'hustlerBinger',
      'Binger: 4 at a time every 2 s from 40 tonics, never runs',
      () => hustler({ batch: 4, dealBelow: 100, fleeWhen: 0, lieLow: false }),
      40,
    ],
    [
      'hustlerBingeRun',
      'Binge-and-run: 4 at a time until the law comes, then runs',
      () => hustler({ batch: 4, dealBelow: 100, fleeWhen: 1, lieLow: true }),
      40,
    ],
    [
      'hustlerCareful',
      'Careful: 3 at a time, only if heat stays under 36; lies low and runs if hunted (40 tonics)',
      () => hustler({ batch: 3, dealBelow: 100, ceiling: 36, fleeWhen: 1, lieLow: true }),
      40,
    ],
  ];
  for (const [key, title, policy, stock] of scenarios) {
    summariseRuns(`${title} (5 min)`, key, mk(key, policy, stock));
  }
}

// ---------------------------------------------------------------------------------------------------------------
// 3. Heat decay and de-escalation.

if (want('heat')) {
  const rows: (string | number)[][] = [];
  for (const start of [45, 70, 100]) {
    const w = newScene(1, true, 40);
    w.p.heat = start;
    w.p.x = 20;
    w.p.z = 20;
    let t40 = -1;
    let t15 = -1;
    let t0 = -1;
    for (let t = 1; t < 20000 && t0 < 0; t++) {
      stepWorld(w.w, TICK_MS, []);
      w.w.officers = []; // lying low somewhere nobody looks: this measures the decay alone
      if (t40 < 0 && w.p.heat < WANTED_HEAT) t40 = t;
      if (t15 < 0 && w.p.heat < 15) t15 = t;
      if (w.p.heat === 0) t0 = t;
    }
    rows.push([
      start,
      `${f1(secs(t40))}s`,
      `${f1(secs(t15))}s`,
      `${f1(secs(t0))}s`,
      `${(1 / secs(HEAT_DECAY_TICKS)).toFixed(2)}/s`,
    ]);
  }
  table(
    'Heat decay with nobody around',
    ['start heat', 'to below wanted', 'to calm (<15)', 'to zero', 'rate'],
    rows,
  );
  report.heatDecay = rows;
}

// ---------------------------------------------------------------------------------------------------------------
// 4. Guns.

if (want('guns')) {
  const ranges = [2, 4, 6, 8, 11, 15, 20];
  for (const kind of OFFICER_KINDS as readonly OfficerKind[]) {
    const rows: (string | number)[][] = [];
    for (const g of WEAPON_IDS) {
      const d = WEAPONS[g];
      const cells: string[] = [];
      for (const r of ranges) {
        if (r > d.range) {
          cells.push('out');
          continue;
        }
        const ds = Array.from({ length: 30 }, (_, i) => duelKill(g, kind, r, i + 1));
        const done = ds.filter((x) => x.killed);
        cells.push(
          done.length < ds.length * 0.5
            ? 'never'
            : `${f1(secs(summarize(done.map((x) => x.ticks)).p50))}s/${f1(summarize(done.map((x) => x.shots)).p50)}`,
        );
      }
      rows.push([`${g} ($${d.price})`, ...cells]);
    }
    table(
      `Time to kill a ${OFFICERS[kind].name} (${OFFICERS[kind].hp} hp), median seconds / shots, by range in tiles`,
      ['gun', ...ranges.map(String)],
      rows,
    );
    report[`ttk_${kind}`] = rows;
  }

  const stat: (string | number)[][] = WEAPON_IDS.map((g) => {
    const d = WEAPONS[g];
    const cycle = d.fireTicks / 20;
    const dps = (d.damage * d.pellets) / cycle;
    const sustained =
      (d.damage * d.pellets * d.magazine) / ((d.fireTicks * (d.magazine - 1) + d.reloadTicks) / 20);
    return [
      g,
      d.price,
      d.ammoPrice,
      `${d.damage}x${d.pellets}`,
      f1(1 / cycle),
      d.magazine,
      f1(d.reloadTicks / 20),
      d.range,
      d.spread,
      f1(dps),
      f1(sustained),
    ];
  });
  table(
    'Gun sheet',
    [
      'gun',
      'price',
      'mag $',
      'dmg',
      'shots/s',
      'mag',
      'reload s',
      'range',
      'spread',
      'dps',
      'dps w/ reload',
    ],
    stat,
  );
}

// ---------------------------------------------------------------------------------------------------------------
// 5. Fights: one weapon against squads.

if (want('fights')) {
  const rows: (string | number)[][] = [];
  const out: Record<string, unknown> = {};
  for (const kind of OFFICER_KINDS as readonly OfficerKind[]) {
    for (const g of WEAPON_IDS) {
      const cells: string[] = [];
      for (let n = 1; n <= MAX_OFFICERS; n++) {
        const rs = seeds.map((s) =>
          fight({ weapon: g, kind, count: n, seed: s, fullAmmo: true, start: 14 }),
        );
        cells.push(
          `${pct(rate(rs.map((r) => r.won)))} / ${f1(summarize(rs.map((r) => r.hpLeft)).p50)}hp`,
        );
        out[`${kind}.${g}.${n}`] = {
          win: rate(rs.map((r) => r.won)),
          hp: summarize(rs.map((r) => r.hpLeft)).p50,
        };
      }
      rows.push([OFFICERS[kind].name, g, ...cells]);
    }
  }
  table(
    'Standing fight on open ground: win rate / median health left, by squad size (squad starts 14 tiles out)',
    ['squad', 'gun', '1', '2', '3', '4'],
    rows,
  );
  report.fights = out;

  const standRows: (string | number)[][] = [];
  for (const g of WEAPON_IDS) {
    const cells: string[] = [];
    for (let n = 1; n <= MAX_OFFICERS; n++) {
      const rs = seeds.map((s) =>
        fight({ weapon: g, kind: 'metrocop', count: n, seed: s, fullAmmo: true, stand: true }),
      );
      cells.push(pct(rate(rs.map((r) => r.won))));
    }
    standRows.push([g, ...cells]);
  }
  table(
    'Same, but the player stands still and never closes in: win rate vs Metrocops',
    ['gun', '1', '2', '3', '4'],
    standRows,
  );
  report.standing = standRows;

  const kite: (string | number)[][] = [];
  for (const g of WEAPON_IDS) {
    const cells: string[] = [];
    for (let n = 1; n <= MAX_OFFICERS; n++) {
      const rs = seeds.map((s) =>
        fight({
          weapon: g,
          kind: n > 2 ? 'combine-soldier' : 'metrocop',
          count: n,
          seed: s,
          fullAmmo: true,
          kite: Math.min(WEAPONS[g].range * 0.8, 9),
        }),
      );
      cells.push(`${pct(rate(rs.map((r) => r.won)))}`);
    }
    kite.push([g, ...cells]);
  }
  table(
    'Kiting player (backs away): win rate vs 1-2 Metrocops, 3-4 Combine',
    ['gun', '1', '2', '3', '4'],
    kite,
  );
  report.kite = kite;
}

// ---------------------------------------------------------------------------------------------------------------
// 6. The gunman campaign: earn, buy, fight.

if (want('gunman')) {
  // A fight that starts from a deal: each gun (free, with a purse to restock) starts wanted at heat 45 and then fights
  // on, with the heat doing what it does (+1 a hit, +20 a kill, -1 every 2.5 s), until the first knock-out or 3 min.
  const starts = [45, 70];
  const attr: (string | number)[][] = [];
  const out: Record<string, unknown> = {};
  for (const g of WEAPON_IDS) {
    const cells: string[] = [];
    for (const heat of starts) {
      const logs = seeds.map(
        (s) =>
          run('gunman', gunman({ weapon: g, engage: true }), {
            seed: s,
            ticks: 3600,
            size: SIZE,
            setup: (_w, p) => {
              p.money = 6000;
              p.heat = heat;
            },
            until: (_w, _p, l) => l.downs > 0,
          }).log,
      );
      const survived = rate(logs.map((l) => l.downs === 0));
      const downAt = summarize(logs.filter((l) => l.downs > 0).map((l) => secs(l.ticks)));
      cells.push(
        `${pct(survived)} / ${f1(summarize(logs.map((l) => l.killed)).mean)}k / ${Number.isFinite(downAt.p50) ? `${f1(downAt.p50)}s` : '-'}`,
      );
      out[`${g}.${heat}`] = { survived, kills: summarize(logs.map((l) => l.killed)).mean, downAt };
    }
    attr.push([g, ...cells]);
  }
  table(
    'Fighting on from a first deal: survives 3 min / kills (mean) / time to first knock-out (p50)',
    ['gun', ...starts.map((h) => `starts at heat ${h}`)],
    attr,
  );
  report.gunmanAttrition = out;

  // The realistic campaign: sell a little, and when the law turns up buy the best gun the cash allows.
  const camp: (string | number)[][] = [];
  for (const stock of [8, 14, 24]) {
    const logs = seeds.map(
      (s) =>
        run('gunman', gunman({}), {
          seed: s,
          ticks: 6000,
          size: SIZE,
          setup: withStock(stock) as never,
        }).log,
    );
    const guns = new Map<string, number>();
    for (const l of logs)
      for (const g of Object.keys(l.shotsByWeapon)) guns.set(g, (guns.get(g) ?? 0) + 1);
    camp.push([
      `${stock} tonics`,
      [...guns.keys()].join(',') || 'none',
      f1(summarize(logs.map((l) => l.killed)).mean),
      f1(summarize(logs.map((l) => l.spawned)).mean),
      pct(rate(logs.map((l) => l.downs > 0))),
      f1(summarize(logs.map((l) => l.moneyEnd - l.moneyStart)).p50),
    ]);
  }
  table(
    'Gunman campaign: deals until wanted, then buys the best gun the cash allows and fights on (5 min)',
    ['start stock', 'gun bought', 'kills', 'officers', 'downed >=1', 'net money p50'],
    camp,
  );
  report.gunmanCampaign = camp;
}

// ---------------------------------------------------------------------------------------------------------------
// 7. Performance: cost of a tick with officers on the island.

if (want('perf')) {
  const rows: (string | number)[][] = [];
  const out: Record<string, number> = {};
  for (const size of [48, 96]) {
    let base = 0;
    for (const n of [0, 1, 2, 4]) {
      const sc = newScene(3, false, size);
      sc.p.x = Math.floor(size / 2);
      sc.p.z = Math.floor(size / 2);
      const rand = makeRng(5);
      let placed = 0;
      for (let tries = 0; tries < 600 && placed < n; tries++) {
        const x = 1 + Math.floor(rand() * (size - 2));
        const z = 1 + Math.floor(rand() * (size - 2));
        if (Math.hypot(x - sc.p.x, z - sc.p.z) < 14) continue;
        if (placeOfficer(sc.w, 'metrocop', x, z, sc.p, [])) placed++;
      }
      // Armed so they shoot (the expensive path); topped up so the scene lasts. Heat just under the line so
      // killing/hurting changes nothing, and nobody else is called.
      sc.p.arms.equipped = 'pistol';
      sc.p.arms.guns.pistol = { mag: 12, reserve: 24 };
      let tk = 0;
      const mid = Math.floor(size / 2);
      const step = () => {
        // The target keeps moving, so the hunters keep re-planning: the expensive case.
        tk++;
        sc.p.x = mid + Math.cos(tk / 40) * 9;
        sc.p.z = mid + Math.sin(tk / 40) * 9;
        sc.p.heat = 39;
        sc.p.hp = 100;
        for (const o of sc.w.officers) o.hp = 1e6;
        stepWorld(sc.w, TICK_MS, []);
      };
      for (let i = 0; i < 300; i++) step(); // warm the JIT
      const times: number[] = [];
      for (let i = 0; i < 1200; i++) {
        const t0 = performance.now();
        step();
        times.push((performance.now() - t0) * 1000);
      }
      const s = summarize(times);
      if (n === 0) base = s.mean;
      rows.push([
        size,
        `${placed}/${n}`,
        `${s.mean.toFixed(0)} us`,
        `${s.p90.toFixed(0)} us`,
        `${s.max.toFixed(0)} us`,
        n ? `${((s.mean - base) / n).toFixed(0)} us` : '-',
      ]);
      out[`${size}.${n}.mean`] = s.mean;
      out[`${size}.${n}.max`] = s.max;
    }
  }
  table(
    'Tick cost with officers hunting an armed player (1200 ticks, 20 s)',
    ['map', 'officers placed', 'mean', 'p90', 'worst', 'per officer (mean)'],
    rows,
  );
  report.perfMicros = out;
  console.log(`\n(the budget is ${TICK_MS * 1000} us per tick)`);
}

// ---------------------------------------------------------------------------------------------------------------
// 8. Stuck hunters: a mixed bag of policies on many islands of three sizes.

if (want('stuck')) {
  const notes: string[] = [];
  let runs = 0;
  let stuck = 0;
  let spawned = 0;
  for (const size of [32, 48, 64]) {
    for (const s of seeds) {
      const policies = [
        hustler({ batch: 6, dealBelow: 100, fleeWhen: 1, lieLow: true, maxDeals: 1 }),
        hustler({ batch: 20, dealBelow: 100, fleeWhen: 0, lieLow: false, maxDeals: 1 }),
        gunman({ weapon: 'rifle', engage: true }),
      ];
      for (const [i, policy] of policies.entries()) {
        const { log } = run(`stuck${i}`, policy, {
          seed: s * 31 + i,
          ticks: 4000,
          size,
          setup: (_w, p) => {
            p.money = 6000;
            p.inventory['mystery-tonic'] = 20;
            if (i === 2) p.heat = 60;
          },
        });
        runs++;
        stuck += log.stuckOfficers;
        spawned += log.spawned;
        for (const n of log.stuckNotes)
          notes.push(`size ${size} seed ${s * 31 + i} policy ${i}: ${n}`);
      }
    }
  }
  table(
    'Stuck hunters (20 s motionless with nothing to do)',
    ['runs', 'officers spawned', 'stuck'],
    [[runs, spawned, stuck]],
  );
  for (const n of notes.slice(0, 10)) console.log(`  ${n}`);
  report.stuck = { runs, spawned, stuck, notes: notes.slice(0, 20) };
}

// ---------------------------------------------------------------------------------------------------------------

writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(`\nWrote ${OUT}`);
