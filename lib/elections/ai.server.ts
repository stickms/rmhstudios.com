/**
 * AI summaries and Q&A for the election hub. Server-only.
 *
 * Grounding is the whole safety story: the model is handed a JSON of facts we
 * computed (`buildFacts`) and told it is the only source of truth, with the
 * shared injection frame around it. Candidate names come from an external feed,
 * so they are DATA like any user content — `asData()` fences them off.
 *
 * Cost is bounded without a per-request check, because the page-level summary
 * is shared by every viewer: one call per snapshot fingerprint (which moves
 * only when a race is called or control changes), never more than one per
 * MIN_INTERVAL_MS, single-flight. A live night is a few dozen calls total.
 */

import { assertAiBudget } from '@/lib/ai/budget.server';
import { isAiConfigured, runTask } from '@/lib/ai/provider.server';
import { ELECTION_ASK, ELECTION_SUMMARY, asData, systemFor } from '@/lib/ai/prompts';
import { relevantRaces, raceForPrompt } from './ask';
import { buildFacts, snapshotFingerprint } from './summary';
import type { ElectionSnapshot } from './types';

const MIN_INTERVAL_MS = 90_000;

export interface AiSummary {
  summary: string | null;
  fingerprint: string;
  generatedAt: string | null;
}

interface Entry {
  fingerprint: string;
  summary: string;
  at: number;
}

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<AiSummary>>();

const clean = (raw: string, max: number) =>
  raw
    .replace(/[*_`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

export async function getAiSummary(
  snapshot: ElectionSnapshot,
  now: number = Date.now(),
): Promise<AiSummary> {
  const fingerprint = snapshotFingerprint(snapshot);
  const key = snapshot.date;
  const hit = cache.get(key);
  const none = (): AiSummary => ({ summary: hit?.summary ?? null, fingerprint, generatedAt: hit ? new Date(hit.at).toISOString() : null });

  if (!snapshot.races.length || !isAiConfigured()) return { ...none(), summary: null };
  if (hit && (hit.fingerprint === fingerprint || now - hit.at < MIN_INTERVAL_MS)) {
    return { summary: hit.summary, fingerprint: hit.fingerprint, generatedAt: new Date(hit.at).toISOString() };
  }

  let p = inflight.get(key);
  if (!p) {
    p = (async (): Promise<AiSummary> => {
      try {
        const raw = await runTask(
          'summarize',
          systemFor(ELECTION_SUMMARY),
          asData(JSON.stringify(buildFacts(snapshot))),
          { userId: null, promptId: ELECTION_SUMMARY.id, promptVer: ELECTION_SUMMARY.version },
        );
        const summary = clean(raw, ELECTION_SUMMARY.maxChars);
        if (!summary) return none();
        const at = Date.now();
        cache.set(key, { fingerprint, summary, at });
        return { summary, fingerprint, generatedAt: new Date(at).toISOString() };
      } catch (err) {
        // Keep serving the previous summary rather than blanking the desk.
        console.warn('[elections] AI summary failed:', (err as Error)?.message);
        return none();
      }
    })().finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}

/** Answer one reader question from the facts. Charged to the asker's AI budget. */
export async function answerElectionQuestion(
  question: string,
  snapshot: ElectionSnapshot,
  userId: string,
): Promise<string | null> {
  if (!isAiConfigured()) return null;
  await assertAiBudget(userId);
  const payload = {
    facts: buildFacts(snapshot),
    relevantRaces: relevantRaces(question, snapshot).map(raceForPrompt),
    question,
  };
  const raw = await runTask('concierge', systemFor(ELECTION_ASK), asData(JSON.stringify(payload)), {
    userId,
    promptId: ELECTION_ASK.id,
    promptVer: ELECTION_ASK.version,
  });
  return clean(raw, ELECTION_ASK.maxChars) || null;
}

/** Test seam. */
export function __resetElectionAiCache() {
  cache.clear();
  inflight.clear();
}
