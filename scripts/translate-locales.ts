/**
 * Generate non-English catalogs from the English source of truth using DeepSeek.
 *
 * Idempotent: only (re)translates keys that are missing or whose English source
 * changed, recording the English it translated from in
 * locales/<lng>/.sources.<ns>.json so human edits survive. A brand-new locale
 * (no directory yet) gets every namespace created from scratch.
 *
 * Deliberately alias-free (relative imports + its own DeepSeek client) so it
 * runs BOTH locally via tsx AND under plain `node` inside the deploy image
 * (which can't resolve the `@/` path alias). Translations are batched — one
 * request per ~40 keys — to keep a full-site run tractable.
 *
 * Env:
 *   DEEPSEEK_API_KEY   required
 *   RMHARK_AI_MODEL    model id (default "deepseek-chat"; the deploy uses "deepseek-reasoner")
 *   I18N_BATCH         keys per request (default 40)
 *   I18N_LOCALES       comma-separated locales to run (default: all non-English)
 *
 * Usage: pnpm run i18n:translate
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import OpenAI from "openai";
import { LOCALES, NAMESPACES, TRANSLATE_TARGETS, type Locale } from "../lib/i18n/config.ts";
import { keysToTranslate, type Catalog } from "../lib/i18n/diff.ts";

const ROOT = join(process.cwd(), "locales");
const MODEL = process.env.RMHARK_AI_MODEL || "deepseek-chat";
const BATCH = Math.max(1, Number(process.env.I18N_BATCH || 40));
// How many batch requests to keep in flight at once. DeepSeek tolerates several
// concurrent requests; raise it to go faster, lower it if you hit rate limits.
const CONCURRENCY = Math.max(1, Number(process.env.I18N_CONCURRENCY || 8));

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || "missing",
  baseURL: "https://api.deepseek.com/v1",
  maxRetries: 2,
});

function read(path: string): Catalog {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
}
function write(path: string, data: Catalog) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(sortKeys(data), null, 2) + "\n");
}
function sortKeys(data: Catalog): Catalog {
  return Object.fromEntries(Object.keys(data).sort().map((k) => [k, data[k]]));
}
function stripFences(s: string): string {
  return s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function systemPrompt(target: string): string {
  return (
    `You are a professional UI localizer. Translate the VALUES of the given JSON object into ${target}. ` +
    `Return ONLY a JSON object with EXACTLY the same keys and the translated values — no markdown, no commentary. ` +
    `Preserve every {{placeholder}} verbatim (you may reposition it to fit grammar). ` +
    `Keep i18next plural-suffixed keys (_one/_other/_zero/_few/_many/_two) unchanged. ` +
    `Leave brand/product names untranslated: anything starting with "RMH", plus Stripe, API, Discord, AI. ` +
    `Keep leading/trailing symbols, emojis and casing. If a value is already in ${target}, keep it.`
  );
}

/** Translate one batch of {key: english} → {key: translated}, never dropping a key. */
async function translateBatch(entries: Catalog, target: string): Promise<Catalog> {
  const keys = Object.keys(entries);
  if (keys.length === 0) return {};
  const res = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt(target) },
      { role: "user", content: JSON.stringify(entries) },
    ],
    temperature: 0.2,
    max_tokens: 8000,
    stream: false,
  });
  const raw = res.choices[0]?.message?.content?.trim() ?? "{}";
  let parsed: Catalog = {};
  try {
    parsed = JSON.parse(stripFences(raw));
  } catch {
    parsed = {};
  }
  // Fall back to the English source for anything the model omitted or mangled,
  // so the output always has the full key set (the catalog test requires it).
  const out: Catalog = {};
  for (const k of keys) out[k] = typeof parsed[k] === "string" ? parsed[k] : entries[k];
  return out;
}

function localesToRun(): Locale[] {
  const env = process.env.I18N_LOCALES?.split(",").map((s) => s.trim()).filter(Boolean);
  const only = env && env.length ? new Set(env) : null;
  return LOCALES.filter((l) => l !== "en" && (!only || only.has(l)));
}

/** One (locale, namespace) catalog with work to do, plus its in-memory state. */
interface Job {
  locale: Locale;
  ns: string;
  targetPath: string;
  sourcesPath: string;
  source: Catalog;
  target: Catalog;
  sources: Catalog;
  remaining: number; // batches not yet completed; the last one writes the files
}
/** One batch request belonging to a job. */
interface Task {
  job: Job;
  keys: string[];
}

/** Run `worker` over `items`, keeping at most `limit` in flight at once. */
async function pool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      await worker(items[next++]);
    }
  });
  await Promise.all(runners);
}

async function run() {
  if (!process.env.DEEPSEEK_API_KEY) {
    throw new Error("DEEPSEEK_API_KEY is not set — cannot translate.");
  }
  const targets = localesToRun();
  console.log(
    `[i18n] model=${MODEL} batch=${BATCH} concurrency=${CONCURRENCY} locales=${targets.join(",")}`,
  );

  // Plan every batch up front so we can report overall progress and run them
  // through a fixed-size pool instead of strictly one-at-a-time.
  const tasks: Task[] = [];
  let totalKeys = 0;
  for (const ns of NAMESPACES) {
    const source = read(join(ROOT, "en", `${ns}.json`));
    if (Object.keys(source).length === 0) continue;

    for (const locale of targets) {
      const targetPath = join(ROOT, locale, `${ns}.json`);
      const sourcesPath = join(ROOT, locale, `.sources.${ns}.json`);
      const target = read(targetPath);
      const sources = read(sourcesPath);
      const todo = keysToTranslate({ source, sources, target });
      if (todo.length === 0) continue;

      const job: Job = { locale, ns, targetPath, sourcesPath, source, target, sources, remaining: 0 };
      for (let i = 0; i < todo.length; i += BATCH) {
        job.remaining++;
        tasks.push({ job, keys: todo.slice(i, i + BATCH) });
        totalKeys += Math.min(BATCH, todo.length - i);
      }
    }
  }

  const totalBatches = tasks.length;
  if (totalBatches === 0) {
    console.log("[i18n] everything is already up to date — nothing to translate.");
    return;
  }
  console.log(`[i18n] ${totalBatches} batch(es) · ${totalKeys} key(s) across ${targets.length} locale(s)`);

  let doneBatches = 0;
  let doneKeys = 0;
  const startedAt = Date.now();

  await pool(tasks, CONCURRENCY, async ({ job, keys }) => {
    const entries: Catalog = {};
    for (const k of keys) entries[k] = job.source[k];
    try {
      const translated = await translateBatch(entries, TRANSLATE_TARGETS[job.locale as Exclude<Locale, "en">]);
      for (const k of keys) {
        job.target[k] = translated[k];
        job.sources[k] = job.source[k];
      }
    } catch (err) {
      console.warn(`[i18n]   ${job.locale}/${job.ns} batch failed: ${(err as Error).message}`);
    }

    doneBatches++;
    doneKeys += keys.length;
    const pct = Math.round((doneBatches / totalBatches) * 100);
    const elapsed = (Date.now() - startedAt) / 1000;
    const eta = doneBatches > 0 ? Math.round((elapsed / doneBatches) * (totalBatches - doneBatches)) : 0;
    console.log(
      `[i18n] ${pct}% · ${doneBatches}/${totalBatches} batches · ${doneKeys}/${totalKeys} keys · ETA ~${eta}s · ${job.locale}/${job.ns}`,
    );

    // Last batch for this catalog flushes it to disk.
    if (--job.remaining === 0) {
      write(job.targetPath, job.target);
      write(job.sourcesPath, job.sources);
    }
  });
}

run().then(() => console.log("[i18n] done")).catch((e) => {
  console.error(e);
  process.exit(1);
});
