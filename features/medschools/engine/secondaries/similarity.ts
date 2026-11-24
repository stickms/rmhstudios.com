/**
 * "Reworded" is computed at read time (D4): the Dice coefficient over the set of content-word unigrams plus adjacent
 * content-word bigrams. The threshold is deliberately conservative: a missed link shows one "new" and one "not seen"; a
 * false link would claim a school kept a prompt it replaced. Tune the stop words, never the threshold.
 */

export const SIM_REWORDED = 0.5;
export const SIM_MIN_WORDS = 3;

const STOP_WORDS: ReadonlySet<string> = new Set(
  (
    'a an the and or but nor of to in on at for with by from as into onto over than then so if not no any all some such ' +
    'is are was were be been being am do does did done have has had having it its this that these those ' +
    'you your yours yourself we our ours us they their them he she i me my mine ' +
    'what which who whom whose when where why how would could should will can may might must shall ' +
    'about also there here please very more most much many other another each ' +
    'one two three four five'
  ).split(' '),
);

function stem(word: string): string {
  let w = word;
  if (w.length > 5 && w.endsWith('ly')) w = w.slice(0, -2);
  else if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2);
  else if (w.length > 4 && w.endsWith('es')) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  // "faced" and "face" both end as "fac".
  if (w.length > 3 && w.endsWith('e')) w = w.slice(0, -1);
  return w;
}

/** Lower-case, stop words out, light stem. Order is kept (the bigrams need it). */
export function contentWords(text: string): string[] {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/['’]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 0 && !STOP_WORDS.has(w))
    .map(stem);
}

function features(words: readonly string[]): Set<string> {
  const out = new Set<string>(words);
  for (let i = 0; i + 1 < words.length; i++) out.add(`${words[i]} ${words[i + 1]}`);
  return out;
}

/** 0..1; 0 when either side has fewer than `SIM_MIN_WORDS` content words. */
export function similarity(a: string, b: string): number {
  const wa = contentWords(a);
  const wb = contentWords(b);
  if (wa.length < SIM_MIN_WORDS || wb.length < SIM_MIN_WORDS) return 0;
  const fa = features(wa);
  const fb = features(wb);
  let shared = 0;
  for (const f of fa) if (fb.has(f)) shared += 1;
  return (2 * shared) / (fa.size + fb.size);
}

export function isReworded(a: string, b: string): boolean {
  return similarity(a, b) >= SIM_REWORDED;
}

/**
 * Greedy one-to-one assignment by descending score, only pairs at or above `SIM_REWORDED`; ties broken by id so the
 * result never depends on input order.
 */
export function matchPrompts(
  older: readonly { id: string; text: string }[],
  newer: readonly { id: string; text: string }[],
): { newerId: string; olderId: string; score: number }[] {
  const pairs: { newerId: string; olderId: string; score: number }[] = [];
  for (const n of newer) {
    for (const o of older) {
      const score = similarity(o.text, n.text);
      if (score >= SIM_REWORDED) pairs.push({ newerId: n.id, olderId: o.id, score });
    }
  }
  pairs.sort((x, y) => y.score - x.score || x.newerId.localeCompare(y.newerId) || x.olderId.localeCompare(y.olderId));
  const usedNewer = new Set<string>();
  const usedOlder = new Set<string>();
  const out: { newerId: string; olderId: string; score: number }[] = [];
  for (const p of pairs) {
    if (usedNewer.has(p.newerId) || usedOlder.has(p.olderId)) continue;
    usedNewer.add(p.newerId);
    usedOlder.add(p.olderId);
    out.push(p);
  }
  return out;
}
