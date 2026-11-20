/* eslint-disable no-console -- This CLI reports translation progress to the terminal. */
/**
 * Generate non-English catalogs from the English source of truth using DeepSeek.
 * Run by `.github/workflows/i18n-translate.yml` (see docs/translations.md).
 *
 * Every string is paid for at most once:
 *   - Idempotent: only keys that are missing, or whose English changed since
 *     they were translated, are sent. locales/<lng>/.sources.<ns>.json records
 *     the English each translation was made from, so human edits survive.
 *   - Paid work is reused: I18N_REUSE_DIR names catalogs from earlier runs (the
 *     i18n-translate workflow points it at the older `i18n/*` branches that
 *     scripts/i18n-collect-reuse.ts gathers). Any of their translations made
 *     from today's English is adopted instead of re-sent.
 *   - Identical English is sent once per locale: a string that already has a
 *     current translation under any key is copied, and one that appears under
 *     several untranslated keys is sent once and fanned out.
 *   - Strings without words ("10", "—", "{{a}}/{{b}}") are copied, never sent.
 *
 * Deliberately alias-free (relative imports + its own DeepSeek client) so it
 * runs under plain tsx without the `@/` path alias. Translations are batched,
 * one request per ~40 keys.
 *
 * Env:
 *   DEEPSEEK_API_KEY   required unless I18N_DRY_RUN or I18N_REUSE_ONLY
 *   DEEPSEEK_FLASH_MODEL  model id (default "deepseek-flash"; thinking is off)
 *   I18N_BATCH         keys per request (default 40)
 *   I18N_CONCURRENCY   requests in flight (default 8)
 *   I18N_LOCALES       comma-separated locales to run (default: every shipped
 *                      non-English locale). Parked locales (PENDING_LOCALES)
 *                      are accepted only with I18N_REUSE_ONLY.
 *   I18N_REUSE_DIR     `locales/` directories holding paid, unmerged
 *                      translations, separated by ":"; earlier ones win
 *   I18N_REUSE_ONLY    "1" to adopt reusable translations and stop: no API calls
 *   I18N_DRY_RUN       "1" to report planned work without API calls or writes
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import OpenAI from 'openai';
import {
  LOCALES,
  NAMESPACES,
  PENDING_LOCALES,
  TRANSLATE_TARGETS,
  type Locale,
} from '../lib/i18n/config.ts';
import {
  adoptPaidTranslations,
  applyTranslationMemory,
  batchKeys,
  dedupeTodo,
  localeSource,
  parseModelJson,
  planCatalogTranslations,
  pluralCategories,
  settleCatalog,
  translationMemory,
  validateTranslationBatch,
  type Catalog,
  type CatalogPlan,
} from '../lib/i18n/diff.ts';
import { DEEPSEEK_FLASH } from '../lib/ai/deepseek-models.ts';

const ROOT = join(process.cwd(), 'locales');
const REUSE = (process.env.I18N_REUSE_DIR ?? '')
  .split(':')
  .map((d) => d.trim())
  .filter(Boolean);
const DRY_RUN = process.env.I18N_DRY_RUN === '1';
const REUSE_ONLY = process.env.I18N_REUSE_ONLY === '1';
const MODEL = DEEPSEEK_FLASH.model;
const BATCH = Math.max(1, Number(process.env.I18N_BATCH || 40));
// How many batch requests to keep in flight at once. DeepSeek tolerates several
// concurrent requests; raise it to go faster, lower it if you hit rate limits.
const CONCURRENCY = Math.max(1, Number(process.env.I18N_CONCURRENCY || 8));

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || 'missing',
  baseURL: 'https://api.deepseek.com/v1',
  maxRetries: 2,
});

function read(path: string): Catalog {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
}
function write(path: string, data: Catalog) {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, JSON.stringify(sortKeys(data), null, 2) + '\n');
}
function sortKeys(data: Catalog): Catalog {
  return Object.fromEntries(
    Object.keys(data)
      .sort()
      .map((k) => [k, data[k]]),
  );
}
function stripFences(s: string): string {
  return s
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function systemPrompt(target: string): string {
  return (
    `You are a professional UI localizer. Translate the VALUES of the given JSON object into ${target}. ` +
    `Return ONLY a JSON object with EXACTLY the same keys and the translated values — no markdown, no commentary. ` +
    `Preserve every {{placeholder}} verbatim (you may reposition it to fit grammar). ` +
    `Keys ending in _zero, _one, _two, _few, _many or _other are the CLDR plural forms of one message for ${target}; ` +
    `their English values may be identical. Write each in the form ${target} uses for that plural category, and keep the keys unchanged. ` +
    `Leave brand/product names untranslated: anything starting with "RMH", plus Stripe, API, Discord, AI. ` +
    `Keep leading/trailing symbols, emojis and casing. If a value is already in ${target}, keep it.`
  );
}

/** Translate one batch, rejecting incomplete replies so they remain pending. */
async function translateBatch(entries: Catalog, target: string): Promise<Catalog> {
  const keys = Object.keys(entries);
  if (keys.length === 0) return {};
  const res = await client.chat.completions.create({
    ...DEEPSEEK_FLASH,
    messages: [
      { role: 'system', content: systemPrompt(target) },
      { role: 'user', content: JSON.stringify(entries) },
    ],
    temperature: 0.2,
    max_tokens: 8000,
    stream: false,
    // JSON mode: the reply is one JSON object. parseModelJson still takes only
    // the first object, because a reply with trailing text cost a paid batch.
    response_format: { type: 'json_object' },
  });
  const raw = res.choices[0]?.message?.content?.trim() ?? '{}';
  return validateTranslationBatch(entries, parseModelJson(stripFences(raw)));
}

/**
 * Translate a batch; if it fails, retry it once as two halves (plural groups
 * kept whole) so one bad reply costs a few keys, not forty. Returns what was
 * translated and the keys that still failed.
 */
async function translateWithRetry(
  entries: Catalog,
  target: string,
  where: string,
): Promise<{ translated: Catalog; failed: string[] }> {
  try {
    return { translated: await translateBatch(entries, target), failed: [] };
  } catch (err) {
    const keys = Object.keys(entries);
    console.warn(`[i18n]   ${where} batch failed, retrying in halves: ${(err as Error).message}`);
    const translated: Catalog = {};
    const failed: string[] = [];
    for (const part of batchKeys(keys, Math.max(1, Math.ceil(keys.length / 2)))) {
      const half: Catalog = {};
      for (const k of part) half[k] = entries[k];
      try {
        Object.assign(translated, await translateBatch(half, target));
      } catch (again) {
        failed.push(...part);
        console.warn(`[i18n]   ${where} ${part.length} key(s) failed again: ${(again as Error).message}`);
      }
    }
    return { translated, failed };
  }
}

function localesToRun(): string[] {
  const requested = process.env.I18N_LOCALES?.split(',')
    .map((l) => l.trim())
    .filter(Boolean);
  const shipped = LOCALES.filter((l) => l !== 'en') as string[];
  if (!requested || requested.length === 0) return shipped;
  const parked = PENDING_LOCALES as readonly string[];
  for (const l of requested) {
    if (shipped.includes(l)) continue;
    if (parked.includes(l) && REUSE_ONLY) continue;
    throw new Error(
      parked.includes(l)
        ? `${l} is parked (PENDING_LOCALES): it can only take reused translations (I18N_REUSE_ONLY=1).`
        : `${l} is not a locale this site has.`,
    );
  }
  return requested;
}

/** One (locale, namespace) catalog, planned, plus the bookkeeping to flush it. */
interface Job extends CatalogPlan {
  locale: string;
  ns: string;
  targetPath: string;
  sourcesPath: string;
  dirty: boolean;
  /** The English catalog itself (`source` is it re-shaped for this locale's plurals). */
  english: Catalog;
  categories: string[];
  existed: boolean;
  /** A model answer landed in this catalog during this run. */
  paid: boolean;
  /** Batches (its own, and owners its followers wait on) not yet finished. */
  remaining: number;
}
/** One batch request: owner keys of one job, plus the keys copying them. */
interface Task {
  job: Job;
  keys: string[];
  followers: { job: Job; key: string; ownerKey: string }[];
}

/** Run `worker` over `items`, keeping at most `limit` in flight at once. */
async function pool<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      await worker(items[next++]);
    }
  });
  await Promise.all(runners);
}

function flush(job: Job) {
  if (DRY_RUN || !job.dirty) return;
  if (!settleCatalog(job)) return;
  write(job.targetPath, job.target);
  write(job.sourcesPath, job.sources);
  job.dirty = false;
}

/** Totals for the log and the GitHub job summary. */
const totals = { adopted: 0, remembered: 0, deduped: 0, sent: 0, translated: 0, failed: 0 };

function summary(locales: string[]) {
  const lines = [
    `| | keys |`,
    `| --- | ---: |`,
    `| Reused from unmerged runs | ${totals.adopted} |`,
    `| Copied from an identical string already translated | ${totals.remembered} |`,
    `| Copied from an identical string sent in this run | ${totals.deduped} |`,
    `| Sent to the model | ${totals.sent} |`,
    `| Translated | ${totals.translated} |`,
    `| Failed (left for the next run) | ${totals.failed} |`,
  ];
  console.log(
    `[i18n] reused=${totals.adopted} remembered=${totals.remembered} deduped=${totals.deduped} sent=${totals.sent} translated=${totals.translated} failed=${totals.failed}`,
  );
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (file) {
    appendFileSync(
      file,
      `### Translation (${DRY_RUN ? 'dry run, ' : ''}${MODEL}; ${locales.join(', ')})\n\n${lines.join('\n')}\n\n`,
    );
  }
}

async function run() {
  if (!DRY_RUN && !REUSE_ONLY && !process.env.DEEPSEEK_API_KEY) {
    throw new Error('DEEPSEEK_API_KEY is not set — cannot translate.');
  }
  for (const dir of REUSE) {
    if (!existsSync(dir)) throw new Error(`Catalog directory does not exist: ${dir}`);
  }
  const targets = localesToRun();
  console.log(
    `[i18n] model=${MODEL} batch=${BATCH} concurrency=${CONCURRENCY} locales=${targets.join(',')}` +
      (REUSE.length ? ` reuse=${REUSE.length} dir(s)` : '') +
      (REUSE_ONLY ? ' (reuse only)' : '') +
      (DRY_RUN ? ' (dry run)' : ''),
  );

  const english = new Map<string, Catalog>();
  for (const ns of NAMESPACES) {
    const source = read(join(ROOT, 'en', `${ns}.json`));
    if (Object.keys(source).length > 0) english.set(ns, source);
  }

  // Plan every batch up front, locale by locale: a locale's memory and dedupe
  // span all of its namespaces.
  const tasks: Task[] = [];
  const jobs: Job[] = [];
  for (const locale of targets) {
    const categories = pluralCategories(locale);
    const plans: Job[] = [];
    for (const [ns, en] of english) {
      const source = localeSource(en, categories);
      const targetPath = join(ROOT, locale, `${ns}.json`);
      const sourcesPath = join(ROOT, locale, `.sources.${ns}.json`);
      const originalTarget = read(targetPath);
      const originalSources = read(sourcesPath);
      const plan = planCatalogTranslations({ source, target: originalTarget, sources: originalSources });
      for (const dir of REUSE) {
        totals.adopted += adoptPaidTranslations({
          source,
          target: plan.target,
          sources: plan.sources,
          paidTarget: read(join(dir, locale, `${ns}.json`)),
          paidSources: read(join(dir, locale, `.sources.${ns}.json`)),
        });
      }
      // Adoption can satisfy keys the plan listed as todo.
      plan.todo = plan.todo.filter(
        (key) => !(plan.sources[key] === source[key] && key in plan.target),
      );
      const job: Job = {
        ...plan,
        source,
        english: en,
        categories,
        existed: existsSync(targetPath),
        paid: false,
        locale,
        ns,
        targetPath,
        sourcesPath,
        remaining: 0,
        dirty:
          JSON.stringify(plan.target) !== JSON.stringify(originalTarget) ||
          JSON.stringify(plan.sources) !== JSON.stringify(originalSources),
      };
      plans.push(job);
    }

    const memory = translationMemory(plans);
    const snapshot = (p: Job) => JSON.stringify([p.target, p.sources]);
    const before = plans.map(snapshot);
    totals.remembered += applyTranslationMemory(plans, memory);
    plans.forEach((p, i) => {
      if (snapshot(p) !== before[i]) p.dirty = true;
    });
    jobs.push(...plans);
    // Free results are written now in a reuse-only run, and with the model's
    // answers otherwise, so a plural group is settled only once it is whole.
    if (REUSE_ONLY) {
      for (const job of plans) flush(job);
      continue;
    }

    const followers = dedupeTodo(plans);
    totals.deduped += followers.length;
    const waiting = new Map<string, Task['followers']>();
    for (const f of followers) {
      const id = `${f.ownerPlan.ns}\u0000${f.ownerKey}`;
      const list = waiting.get(id) ?? [];
      list.push({ job: f.plan, key: f.key, ownerKey: f.ownerKey });
      waiting.set(id, list);
    }
    for (const job of plans) {
      for (const keys of batchKeys(job.todo, BATCH)) {
        const task: Task = {
          job,
          keys,
          followers: keys.flatMap((k) => waiting.get(`${job.ns}\u0000${k}`) ?? []),
        };
        job.remaining++;
        for (const other of new Set(task.followers.map((f) => f.job))) {
          if (other !== job) other.remaining++;
        }
        tasks.push(task);
        totals.sent += keys.length;
      }
    }
  }

  const totalBatches = tasks.length;
  if (totalBatches === 0) {
    console.log('[i18n] nothing to send to the model.');
    for (const job of jobs) flush(job);
    summary(targets);
    return;
  }
  console.log(`[i18n] ${totalBatches} batch(es) · ${totals.sent} key(s) across ${targets.length} locale(s)`);
  if (DRY_RUN) {
    summary(targets);
    return;
  }

  let doneBatches = 0;
  let doneKeys = 0;
  const startedAt = Date.now();

  await pool(tasks, CONCURRENCY, async ({ job, keys, followers }) => {
    const entries: Catalog = {};
    for (const k of keys) entries[k] = job.source[k];
    const { translated, failed } = await translateWithRetry(
      entries,
      TRANSLATE_TARGETS[job.locale as Exclude<Locale, 'en'>],
      `${job.locale}/${job.ns}`,
    );
    for (const k of keys) {
      if (!(k in translated)) continue;
      job.target[k] = translated[k];
      job.sources[k] = job.source[k];
      job.dirty = true;
      job.paid = true;
      totals.translated++;
    }
    for (const f of followers) {
      if (!(f.ownerKey in translated)) continue;
      f.job.target[f.key] = translated[f.ownerKey];
      f.job.sources[f.key] = f.job.source[f.key];
      f.job.dirty = true;
      f.job.paid = true;
      totals.translated++;
    }
    const lost = new Set(failed);
    totals.failed += failed.length + followers.filter((f) => lost.has(f.ownerKey)).length;

    doneBatches++;
    doneKeys += keys.length;
    const pct = Math.round((doneBatches / totalBatches) * 100);
    const elapsed = (Date.now() - startedAt) / 1000;
    const eta =
      doneBatches > 0 ? Math.round((elapsed / doneBatches) * (totalBatches - doneBatches)) : 0;
    console.log(
      `[i18n] ${pct}% · ${doneBatches}/${totalBatches} batches · ${doneKeys}/${totals.sent} keys · ETA ~${eta}s · ${job.locale}/${job.ns}`,
    );

    // A catalog is flushed once every batch it waits on has finished.
    for (const j of new Set([job, ...followers.map((f) => f.job)])) {
      if (--j.remaining === 0) flush(j);
    }
  });
  for (const job of jobs) flush(job);
  summary(targets);
}

run()
  .then(() => console.log('[i18n] done'))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
