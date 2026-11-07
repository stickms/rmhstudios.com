/**
 * Altair balance report — runs the bot across classes and seeds and prints a table.
 *
 *   pnpm exec tsx scripts/altair/balance/report.ts
 *   pnpm exec tsx scripts/altair/balance/report.ts --classes knight,ranger --seeds 3 --skill average --minutes 20
 *   pnpm exec tsx scripts/altair/balance/report.ts --json /tmp/baseline.json
 *
 * Flags
 *   --classes a,b,c   class ids (default: every class in lib/altair/data/classes.ts)
 *   --seeds N         seeds per class, 1..N (default 2)
 *   --skill s         novice | average | expert (default average)
 *   --heat N          Heat tier to play at, 0..20 (default 0)
 *   --minutes M       stop each run at M game minutes (default 22; a full clear is 20:00)
 *   --json path       also write the raw rows as JSON
 *
 * Runs are deterministic: the same flags always print the same numbers, so a before/after
 * diff across a balance change is a real comparison, not noise.
 */
import { writeFileSync } from 'node:fs';
import { CLASSES } from '@/lib/altair/data/classes';
import { playBot, type BotSkill } from './bot';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const skill = arg('skill', 'average') as BotSkill;
const seeds = Math.max(1, Number(arg('seeds', '2')));
const minutes = Math.max(1, Number(arg('minutes', '22')));
const heat = Math.max(0, Math.min(20, Math.trunc(Number(arg('heat', '0')))));
const wanted = arg('classes', '').split(',').filter(Boolean);
const classIds = (wanted.length ? wanted : CLASSES.map((c) => c.id)).filter((id) => CLASSES.some((c) => c.id === id));
const jsonPath = arg('json', '');

const out = (line = ''): void => {
  process.stdout.write(`${line}\n`);
};

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

interface Row {
  classId: string;
  seed: number;
  status: string;
  time: number;
  kills: number;
  level: number;
  bosses: number;
  runCoins: number;
  wallMs: number;
  weapons: string[];
}

const rows: Row[] = [];
out(`skill=${skill} heat=${heat} seeds=${seeds} minutes<=${minutes}\n`);
out('class            seed  end      time   kills  lvl  boss  coins   sim-ms  weapons');
for (const classId of classIds) {
  for (let seed = 1; seed <= seeds; seed++) {
    const run = playBot({ seed: 1000 + seed, classId, skill, heat, maxSteps: minutes * 60 * 60 });
    const r = run.result;
    const row: Row = {
      classId,
      seed,
      status: r.status,
      time: r.gameTime,
      kills: r.kills,
      level: r.level,
      bosses: r.bossesDefeated.length,
      runCoins: r.runCoins,
      wallMs: run.wallMs,
      weapons: run.weapons,
    };
    rows.push(row);
    out(
      `${classId.padEnd(16)} ${String(seed).padStart(4)}  ${r.status.padEnd(8)} ${fmtTime(r.gameTime).padStart(5)}  ${String(r.kills).padStart(5)}  ${String(r.level).padStart(3)}  ${String(row.bosses).padStart(4)}  ${String(r.runCoins).padStart(5)}  ${String(run.wallMs).padStart(6)}  ${run.weapons.join(',')}`,
    );
  }
}

const wins = rows.filter((r) => r.status === 'victory').length;
const avg = (f: (r: Row) => number) => rows.reduce((a, r) => a + f(r), 0) / Math.max(1, rows.length);
out(
  `\n${rows.length} runs  victories ${wins}  avg time ${fmtTime(avg((r) => r.time))}  avg kills ${Math.round(avg((r) => r.kills))}  avg coins ${Math.round(avg((r) => r.runCoins))}`,
);
if (jsonPath) {
  writeFileSync(jsonPath, JSON.stringify({ skill, heat, seeds, minutes, rows }, null, 2));
  out(`wrote ${jsonPath}`);
}
