/**
 * Lightweight lexical similarity (TF-IDF + cosine) for "find similar posts".
 *
 * This is dependency-free and runs in-memory over a bounded candidate set, so
 * it needs no embeddings provider. It captures topical overlap well for short
 * posts; swap in vector embeddings later for true semantic search.
 */

const STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'any', 'can', 'her',
  'was', 'one', 'our', 'out', 'his', 'has', 'had', 'how', 'man', 'new', 'now',
  'old', 'see', 'two', 'who', 'did', 'its', 'let', 'put', 'say', 'she', 'too',
  'use', 'this', 'that', 'with', 'have', 'from', 'they', 'will', 'your', 'what',
  'when', 'them', 'then', 'than', 'just', 'like', 'been', 'were', 'into', 'over',
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9\s#@]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

function termFreq(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  return tf;
}

export interface SimilarDoc<T> {
  doc: T;
  text: string;
}

/**
 * Rank `candidates` by TF-IDF cosine similarity to `queryText`. Returns the top
 * `limit` with a positive score, most similar first.
 */
export function rankSimilar<T>(queryText: string, candidates: SimilarDoc<T>[], limit = 5): { doc: T; score: number }[] {
  const docsTokens = candidates.map((c) => tokenize(c.text));
  const queryTokens = tokenize(queryText);
  const N = candidates.length + 1;

  // Document frequency across query + candidates.
  const df = new Map<string, number>();
  const seenPerDoc = [queryTokens, ...docsTokens].map((toks) => new Set(toks));
  for (const set of seenPerDoc) {
    for (const term of set) df.set(term, (df.get(term) ?? 0) + 1);
  }
  const idf = (term: string) => Math.log((N + 1) / ((df.get(term) ?? 0) + 1)) + 1;

  const tfidfVec = (tokens: string[]) => {
    const tf = termFreq(tokens);
    const vec = new Map<string, number>();
    for (const [term, freq] of tf) vec.set(term, freq * idf(term));
    return vec;
  };

  const cosine = (a: Map<string, number>, b: Map<string, number>) => {
    let dot = 0;
    for (const [term, va] of a) {
      const vb = b.get(term);
      if (vb) dot += va * vb;
    }
    const norm = (v: Map<string, number>) => Math.sqrt([...v.values()].reduce((s, x) => s + x * x, 0));
    const na = norm(a);
    const nb = norm(b);
    return na && nb ? dot / (na * nb) : 0;
  };

  const qVec = tfidfVec(queryTokens);
  return candidates
    .map((c, i) => ({ doc: c.doc, score: cosine(qVec, tfidfVec(docsTokens[i])) }))
    .filter((r) => r.score > 0.01)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
