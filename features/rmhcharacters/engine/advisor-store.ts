/**
 * The advisor conversation, one per character, kept for the session. A store
 * rather than component state so a conversation survives switching tabs, and so
 * another view (the level-up dialog) can start a question from its own click.
 */
import { create } from 'zustand';
import { AI_TIMEOUT_MS, api } from '@/lib/contract/client';
import { HttpError } from '@/lib/http';
import { ADVISOR_LIMITS } from './advisor-limits';
import { askAdvisorApi, type Recommendation } from './advisor.contract';
import { advisorSheet } from './summary';
import type { Character } from './types';

export interface AdvisorTurn {
  role: 'user' | 'assistant';
  content: string;
  /** The options an answer recommends, each with why; looked up against the rules data by the UI. */
  recommendations?: Recommendation[];
}

export type AdvisorFailure = 'limited' | 'unavailable' | 'failed';

interface Thread {
  turns: AdvisorTurn[];
  busy: boolean;
  error: AdvisorFailure | null;
}

interface AdvisorState {
  threads: Record<string, Thread>;
  ask(c: Character, question: string): Promise<void>;
  clear(id: string): void;
}

const EMPTY: Thread = { turns: [], busy: false, error: null };

export const useAdvisor = create<AdvisorState>((set, get) => {
  const patch = (id: string, p: Partial<Thread>) =>
    set((s) => ({ threads: { ...s.threads, [id]: { ...(s.threads[id] ?? EMPTY), ...p } } }));
  return {
    threads: {},
    async ask(c, question) {
      const q = question.trim().slice(0, ADVISOR_LIMITS.question);
      const thread = get().threads[c.id] ?? EMPTY;
      if (!q || thread.busy) return;
      // The model sees its earlier recommendations by name, so "tell me more about the second one" works.
      const history = thread.turns.slice(-ADVISOR_LIMITS.turns).map((x) => ({
        role: x.role,
        content: (x.recommendations?.length ? `${x.content}\n\nRecommended: ${x.recommendations.map((r) => `${r.name} (${r.kind})`).join(', ')}` : x.content).slice(0, ADVISOR_LIMITS.turn),
      }));
      patch(c.id, { busy: true, error: null, turns: [...thread.turns, { role: 'user', content: q }] });
      try {
        const sheet = await advisorSheet(c);
        const res = await api(askAdvisorApi, { body: { system: c.system, question: q, sheet, history }, timeoutMs: AI_TIMEOUT_MS });
        const now = get().threads[c.id] ?? EMPTY;
        patch(c.id, { busy: false, turns: [...now.turns, { role: 'assistant', content: res.answer, recommendations: res.recommendations }] });
      } catch (err) {
        const error: AdvisorFailure = err instanceof HttpError && err.status === 429 ? 'limited' : err instanceof HttpError && err.status === 503 ? 'unavailable' : 'failed';
        patch(c.id, { busy: false, error });
      }
    },
    clear(id) {
      patch(id, { turns: [], error: null });
    },
  };
});

export const useAdvisorThread = (id: string): Thread => useAdvisor((s) => s.threads[id] ?? EMPTY);
