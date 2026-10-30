/**
 * The game channels' object-storage footprint, and the guard that keeps it in budget.
 *
 *   storage-report.ts builders
 *       Prints `TF2_GAME_BUILDER_<KIND>=<n>` lines (lib/tf2-game/assets/versions.ts) for the
 *       workflow to `eval` and append to $GITHUB_ENV, so the builder versions live in one place.
 *   storage-report.ts report [--budget-gb N] [--pending <prefix>=<dir> ...]
 *       Sums the stored size of every game channel of every game (`tf2-game/`, `hl2-game/`,
 *       `portal-game/`, `csgo-game/`; `<game>-game/<kind>/`) from its state file
 *       (one GET each — never a bucket listing). With --pending, a channel about to be pushed
 *       is counted as it will be after the push (its converter's wanted.json and output dir).
 *       An object two channels publish (the shared `tex/`) is counted once. The other channels the game
 *       reads (`COUNTED_CHANNELS`: the HUD base and its localisation) count against the same budget.
 *       Exits 1 when the total exceeds the budget: --budget-gb, else $TF2_GAME_STORAGE_BUDGET_GB,
 *       else GAME_STORAGE_BUDGET_GB (12). Pending dirs without a wanted.json are skipped.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  formatUsage,
  overBudget,
  projectedUsage,
  storedUsage,
  type ChannelState,
  type ChannelUsage,
} from '../../lib/tf2-game/assets/storage';
import {
  channelPrefix,
  channelPublishPrefix,
  channelStateKey,
  COUNTED_CHANNELS,
  GAME_ASSET_CHANNELS,
  GAME_STORAGE_BUDGET_GB,
} from '../../lib/tf2-game/assets/versions';

const [cmd = 'report', ...rest] = process.argv.slice(2);

if (cmd === 'builders') {
  for (const c of Object.values(GAME_ASSET_CHANNELS))
    process.stdout.write(`${c.env}=${c.builder}\n`);
  process.exit(0);
}
if (cmd !== 'report') {
  console.error(
    'usage: storage-report.ts builders | report [--budget-gb N] [--pending prefix=dir ...]',
  );
  process.exit(2);
}

const pending = new Map<string, string>();
let budgetGb = Number(process.env.TF2_GAME_STORAGE_BUDGET_GB || GAME_STORAGE_BUDGET_GB);
for (let i = 0; i < rest.length; i++) {
  if (rest[i] === '--budget-gb') budgetGb = Number(rest[++i]);
  else if (rest[i] === '--pending') {
    const [prefix, dir] = (rest[++i] ?? '').split('=');
    if (!prefix || !dir) {
      console.error('--pending takes <prefix>=<dir>');
      process.exit(2);
    }
    pending.set(prefix, dir);
  }
}
if (!Number.isFinite(budgetGb) || budgetGb <= 0) {
  console.error('the storage budget must be a positive number of GB');
  process.exit(2);
}

async function loadState(key: string): Promise<ChannelState> {
  // Imported here so `builders` runs without storage configured.
  const { getObject } = await import('../../lib/storage/s3.server');
  const obj = await getObject(key); // null only for "no such object"; other errors throw
  if (!obj) return { models: {} };
  const raw = JSON.parse(obj.body.toString('utf8')) as Partial<ChannelState>;
  return { models: raw.models ?? {} };
}

function localSizes(dir: string, wanted: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const name of Object.keys(wanted)) {
    const file = path.join(dir, name);
    if (existsSync(file)) out[name] = statSync(file).size;
  }
  return out;
}

const usages: ChannelUsage[] = [];
// The model and map channels of a game publish the same `tex/` objects: count each object once.
const seen = new Set<string>();
for (const channel of Object.values(GAME_ASSET_CHANNELS)) {
  const prefix = channelPrefix(channel);
  const dedupe = { root: channelPublishPrefix(channel), seen };
  const state = await loadState(channelStateKey(channel));
  const dir = pending.get(prefix);
  const wantedFile = dir ? path.join(dir, 'wanted.json') : null;
  if (dir && wantedFile && existsSync(wantedFile)) {
    const wanted = JSON.parse(readFileSync(wantedFile, 'utf8')) as Record<string, { src: string }>;
    usages.push(
      projectedUsage(
        `${prefix} (after push)`,
        state,
        {
          wanted,
          localSizes: localSizes(dir, wanted),
        },
        dedupe,
      ),
    );
  } else {
    usages.push(storedUsage(prefix, state, dedupe));
  }
}

for (const prefix of COUNTED_CHANNELS) {
  const state = await loadState(`${prefix}_state.json`);
  const dir = pending.get(prefix);
  const wantedFile = dir ? path.join(dir, 'wanted.json') : null;
  if (dir && wantedFile && existsSync(wantedFile)) {
    const wanted = JSON.parse(readFileSync(wantedFile, 'utf8')) as Record<string, { src: string }>;
    usages.push(
      projectedUsage(
        `${prefix} (after push)`,
        state,
        { wanted, localSizes: localSizes(dir, wanted) },
        {
          root: prefix,
          seen,
        },
      ),
    );
  } else {
    usages.push(storedUsage(prefix, state, { root: prefix, seen }));
  }
}

process.stdout.write(formatUsage(usages, budgetGb) + '\n');
const { over, total } = overBudget(usages, budgetGb);
if (over) {
  console.error(
    `::error title=Game storage over budget::${(total / 1024 ** 3).toFixed(2)} GB would exceed the ${budgetGb} GB budget ` +
      '(TF2_GAME_STORAGE_BUDGET_GB). Trim the sound/particle/model lists or raise the budget deliberately.',
  );
  process.exit(1);
}
process.exit(0);
