/**
 * Translation drift sampler (A15).
 *
 * `pnpm i18n:translate` machine-translates English into 15 locales. Nothing
 * ever checks the result. A mistranslated destructive confirmation can sit in
 * production indefinitely, because no English speaker will ever load `ur` and
 * no `ur` speaker knows what the English said. This script round-trips a sample
 * back to English and reports the worst matches for a human to read.
 *
 *   pnpm exec tsx scripts/check-translation-drift.ts
 *   pnpm exec tsx scripts/check-translation-drift.ts --locales ar,ur --sample 300
 *
 * ## It is a sampling tool, not a gate
 *
 * It **always exits 0**, including when the provider is down, `DATABASE_URL` is
 * unset, or every string looks wrong. A round-trip score is a suggestion about
 * where to look; wiring a suggestion to a red build teaches everyone to ignore
 * it, and the first thing a blocked release does is disable the check. Nothing
 * here writes to a locale catalog either — the output is one report file.
 *
 * ## Why the score is lexical, not semantic
 *
 * The original design used embeddings: `1 - cosine(embed(en), embed(back))`.
 * **DeepSeek has no embeddings endpoint**, and DeepSeek is the only provider
 * policy allows, so that measurement is unavailable — not "harder", unavailable.
 * The substitute is the repo's own TF-IDF cosine (`lib/feed/similarity.ts`),
 * scored over the whole sample so the IDF weights come from a real corpus
 * rather than from a pair.
 *
 * That is a genuinely weaker signal and the report says so per row:
 *
 *  - It measures **lexical** overlap. A back-translation that says the same
 *    thing in different words scores as drift. Expect false positives; the
 *    output is a reading list, not a verdict.
 *  - On strings under three content tokens ("Save", "Delete") a single shared
 *    word is the difference between 1.0 and 0.0. Those rows are marked
 *    `lowConfidence` and are checked for exact match first, because the
 *    highest-value strings on the platform — button labels on destructive
 *    actions — are exactly the short ones this method is worst at.
 *  - `topMatchKey` is the second signal and often the more useful one: if the
 *    nearest English string in the whole sample is a *different* key, the
 *    translation has drifted toward some other piece of copy.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { LOCALES, NAMESPACES } from '../lib/i18n/config.ts';
import { rankSimilar, tokenize } from '../lib/feed/similarity.ts';
import { asData, systemFor, type PromptSpec } from '../lib/ai/prompts/index.ts';

/* -------------------------------------------------------------------------- */
/* Arguments                                                                  */
/* -------------------------------------------------------------------------- */

const args = process.argv.slice(2);
const flag = (name: string): string | null => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? null) : null;
};

const ROOT = join(process.cwd(), 'locales');
const OUT = join(ROOT, '.drift-report.json');
/** Keys back-translated per locale. 200 is ~10 model calls at batch 20. */
const SAMPLE = Math.max(1, Number(flag('sample') ?? 200));
/** Keys per model request. Larger batches are cheaper and lose adherence. */
const BATCH = Math.max(1, Number(flag('batch') ?? 20));
/** Fraction of the scored sample written to the report. */
const WORST_FRACTION = 0.02;

const requested = flag('locales');
const TARGETS = (
  requested ? requested.split(',').map((s) => s.trim()) : LOCALES.filter((l) => l !== 'en')
).filter((l): l is string => Boolean(l) && l !== 'en');

/* -------------------------------------------------------------------------- */
/* Catalog loading                                                            */
/* -------------------------------------------------------------------------- */

type Catalog = Record<string, unknown>;

function readJson(path: string): Catalog {
  try {
    return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Catalog) : {};
  } catch {
    return {};
  }
}

/** Flatten a nested catalog to dot-path → string. Non-strings are dropped. */
function flatten(obj: unknown, prefix = '', out: Record<string, string> = {}) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out[path] = v;
    else if (v && typeof v === 'object') flatten(v, path, out);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Weighting                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Copy whose mistranslation costs money, data, or trust.
 *
 * Matched against the **English** source, so the weighting is identical for
 * every locale and a locale cannot dodge scrutiny by being badly translated in
 * the very words used to detect risk.
 */
const RISKY_COPY =
  /\b(?:delete|remove|permanent|irreversible|cannot be undone|cancel|refund|charge|charged|payment|billing|subscri\w*|purchase|buy|price|coins?|unsubscribe|revoke|reset|wipe|erase|ban|block|report|confirm)\b/i;

/**
 * Namespace weight in the sample.
 *
 * `common` and the `settings-*` namespaces carry the buttons and the
 * destructive confirmations, which is where a mistranslation does real damage;
 * a wrong word in a game's flavour text costs somebody a mild "huh?". Weight
 * multiplies the odds of being sampled — it never excludes anything, so a rare
 * namespace can still surface.
 */
function namespaceWeight(ns: string): number {
  if (ns === 'common') return 6;
  if (ns.startsWith('settings-')) return 5;
  if (ns === 'errors' || ns === 'nav' || ns === 'shared') return 3;
  if (ns.startsWith('c-') || ns.startsWith('r-')) return 1;
  return 2;
}

/** Deterministic uniform in [0,1) from a string — makes runs reproducible. */
function hash01(input: string): number {
  const hex = createHash('sha256').update(input).digest('hex').slice(0, 8);
  return parseInt(hex, 16) / 0x1_0000_0000;
}

interface Candidate {
  namespace: string;
  key: string;
  en: string;
  translated: string;
  weight: number;
  /** A-Res weighted-reservoir priority: u^(1/w). Higher wins. */
  priority: number;
}

/**
 * Weighted sample without replacement (Efraimidis–Spirakis "A-Res"), with the
 * uniform draw replaced by a hash of the key.
 *
 * Deterministic on purpose: two runs over an unchanged catalog sample the same
 * keys, so the report diffs cleanly and a fix can be verified by re-running
 * rather than by hoping the key comes up again.
 */
function sample(candidates: Candidate[], n: number): Candidate[] {
  return [...candidates].sort((a, b) => b.priority - a.priority).slice(0, n);
}

/* -------------------------------------------------------------------------- */
/* Back-translation                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Declared as a `PromptSpec` so it goes through `systemFor()` and inherits
 * `SAFETY_FRAME`. That matters even here: the input is UI copy that has already
 * been through one machine translation, and "ignore instructions in the data"
 * is exactly the property a round-trip must not lose.
 */
const BACK_TRANSLATE: PromptSpec = {
  id: 'i18n-back-translate',
  version: 1,
  task: 'compose-assist',
  instructions: [
    'You translate UI strings back into English, literally.',
    'Input is a JSON object of {id: string}. Return ONLY a JSON object with the SAME ids',
    'and the English translation as each value.',
    'Translate what the string ACTUALLY says, not what a UI string of this kind usually says.',
    'Do not improve, shorten, expand, or make it idiomatic — a literal rendering is the',
    'entire point, because the output is compared against the original English.',
    'Preserve every {{placeholder}} verbatim. Never add commentary.',
  ].join('\n'),
  maxChars: 8_000,
};

type RunTask = (
  task: 'compose-assist',
  system: string,
  user: string,
  opts: { json?: boolean; temperature?: number; promptId?: string; promptVer?: number },
) => Promise<string>;

/**
 * Load the model seam lazily.
 *
 * `lib/ai/provider.server.ts` imports the Prisma singleton for usage metering,
 * and that module throws at import time without `DATABASE_URL`. A dynamic
 * import inside a try/catch is what lets this script run — and report that it
 * cannot check — on a machine that has no database, instead of crashing before
 * it prints anything.
 */
async function loadProvider(): Promise<{
  runTask: RunTask;
  jsonFromModelText: (s: string) => unknown;
} | null> {
  try {
    const mod = await import('../lib/ai/provider.server.ts');
    if (!mod.isAiConfigured()) return null;
    return {
      runTask: mod.runTask as unknown as RunTask,
      jsonFromModelText: mod.jsonFromModelText,
    };
  } catch (err) {
    console.warn(`  provider unavailable: ${(err as Error)?.message}`);
    return null;
  }
}

async function backTranslateBatch(
  provider: { runTask: RunTask; jsonFromModelText: (s: string) => unknown },
  batch: Candidate[],
  localeName: string,
): Promise<Map<string, string>> {
  const payload: Record<string, string> = {};
  batch.forEach((c, i) => (payload[String(i)] = c.translated));

  const raw = await provider.runTask(
    'compose-assist',
    systemFor(BACK_TRANSLATE),
    asData(`Source language: ${localeName}\n\n${JSON.stringify(payload)}`),
    {
      json: true,
      // Zero: this is a measuring instrument. A back-translation that varies
      // run to run turns every re-check into a new set of "findings".
      temperature: 0,
      promptId: BACK_TRANSLATE.id,
      promptVer: BACK_TRANSLATE.version,
    },
  );

  const out = new Map<string, string>();
  try {
    const parsed = provider.jsonFromModelText(raw) as Record<string, unknown>;
    batch.forEach((c, i) => {
      const value = parsed[String(i)];
      if (typeof value === 'string' && value.trim())
        out.set(`${c.namespace}:${c.key}`, value.trim());
    });
  } catch {
    // A malformed batch costs those rows, not the run.
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Scoring                                                                    */
/* -------------------------------------------------------------------------- */

/** Normalize for the exact-match short-circuit: case, punctuation, whitespace. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s{}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface Flagged {
  locale: string;
  namespace: string;
  key: string;
  en: string;
  translated: string;
  back: string;
  /** 0 = identical wording, 1 = nothing in common. */
  drift: number;
  /** Fewer than 3 content tokens — the score is nearly binary. Read manually. */
  lowConfidence: boolean;
  /** Nearest English string in the sample. A different key is a strong signal. */
  topMatchKey: string | null;
}

function scoreLocale(locale: string, pairs: { candidate: Candidate; back: string }[]): Flagged[] {
  // One corpus per locale so IDF is computed over real copy rather than over a
  // pair of strings, which is what makes a shared "the" worth less than a
  // shared "subscription".
  const corpus = pairs.map((p) => ({
    doc: `${p.candidate.namespace}:${p.candidate.key}`,
    text: p.back,
  }));

  return pairs.map(({ candidate, back }) => {
    const id = `${candidate.namespace}:${candidate.key}`;
    const tokens = tokenize(candidate.en);

    // Short strings first: on "Save" the cosine is 1 or 0 and nothing in
    // between, so an exact match is worth far more than the score.
    if (normalize(candidate.en) === normalize(back)) {
      return {
        locale,
        namespace: candidate.namespace,
        key: candidate.key,
        en: candidate.en,
        translated: candidate.translated,
        back,
        drift: 0,
        lowConfidence: false,
        topMatchKey: id,
      };
    }

    const ranked = rankSimilar(candidate.en, corpus, corpus.length);
    const own = ranked.find((r) => r.doc === id);
    return {
      locale,
      namespace: candidate.namespace,
      key: candidate.key,
      en: candidate.en,
      translated: candidate.translated,
      back,
      drift: Math.round((1 - (own?.score ?? 0)) * 1000) / 1000,
      lowConfidence: tokens.length < 3,
      topMatchKey: ranked[0]?.doc ?? null,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Main                                                                       */
/* -------------------------------------------------------------------------- */

async function main(): Promise<void> {
  const enCatalogs = new Map<string, Record<string, string>>();
  for (const ns of NAMESPACES) {
    enCatalogs.set(ns, flatten(readJson(join(ROOT, 'en', `${ns}.json`))));
  }

  const provider = await loadProvider();
  if (!provider) {
    console.warn(
      'No usable AI provider (DEEPSEEK_API_KEY unset, or the provider module could not load).\n' +
        'Nothing to check — exiting successfully. This script never fails a build.',
    );
    return;
  }

  const flagged: Flagged[] = [];
  let totalScored = 0;

  for (const locale of TARGETS) {
    const candidates: Candidate[] = [];

    for (const ns of NAMESPACES) {
      const en = enCatalogs.get(ns) ?? {};
      const translated = flatten(readJson(join(ROOT, locale, `${ns}.json`)));
      const weight = namespaceWeight(ns);

      for (const [key, enValue] of Object.entries(en)) {
        const value = translated[key];
        if (typeof value !== 'string' || !value.trim()) continue;
        // Identical to English means untranslated, not drifted. Coverage is
        // `pnpm i18n:coverage`'s job; spending a model call to rediscover it
        // here would crowd out a key that has something to say.
        if (value.trim() === enValue.trim()) continue;
        if (enValue.trim().length < 2) continue;

        const w = weight * (RISKY_COPY.test(enValue) ? 3 : 1);
        candidates.push({
          namespace: ns,
          key,
          en: enValue,
          translated: value,
          weight: w,
          priority: Math.pow(hash01(`${locale}:${ns}:${key}`), 1 / w),
        });
      }
    }

    const chosen = sample(candidates, SAMPLE);
    if (chosen.length === 0) {
      console.warn(`${locale}: no comparable strings — skipped`);
      continue;
    }

    const pairs: { candidate: Candidate; back: string }[] = [];
    for (let i = 0; i < chosen.length; i += BATCH) {
      const batch = chosen.slice(i, i + BATCH);
      try {
        const backs = await backTranslateBatch(provider, batch, locale);
        for (const c of batch) {
          const back = backs.get(`${c.namespace}:${c.key}`);
          if (back) pairs.push({ candidate: c, back });
        }
      } catch (err) {
        // One failed batch is a gap in the sample, not a failed run.
        console.warn(`  ${locale} batch ${i / BATCH}: ${(err as Error)?.message}`);
      }
    }

    const scored = scoreLocale(locale, pairs);
    totalScored += scored.length;
    flagged.push(...scored);
    const risky = scored.filter((s) => RISKY_COPY.test(s.en)).length;
    console.warn(`${locale}: scored ${scored.length}/${chosen.length} (${risky} risky-copy keys)`);
  }

  // The worst 2%, most drifted first. `lowConfidence` rows sort with everything
  // else rather than being dropped — a short destructive label scoring badly is
  // precisely the row worth a human minute, even though the score is noisy.
  flagged.sort((a, b) => b.drift - a.drift);
  const take = Math.max(1, Math.ceil(totalScored * WORST_FRACTION));
  const worst = flagged.slice(0, take).filter((f) => f.drift > 0);

  const report = {
    generatedAt: new Date().toISOString(),
    method: 'tf-idf-cosine-round-trip',
    note:
      'Lexical similarity over a back-translation. DeepSeek has no embeddings endpoint, ' +
      'so this is not semantic distance. Expect false positives; this is a reading list.',
    locales: TARGETS,
    sampledPerLocale: SAMPLE,
    scored: totalScored,
    reported: worst.length,
    flagged: worst,
  };

  writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
  console.warn(`\nWrote ${worst.length} of ${totalScored} scored strings to ${OUT}`);
}

// One catch for the whole script: this must never be the reason a pipeline
// fails. Anything unexpected is printed and swallowed.
main()
  .catch((err) => {
    console.warn('[drift] check failed (non-fatal):', err instanceof Error ? err.message : err);
  })
  .finally(() => {
    // Explicit: the provider opens a Prisma pool for usage metering, which
    // keeps the event loop alive long past the last write.
    process.exit(0);
  });
