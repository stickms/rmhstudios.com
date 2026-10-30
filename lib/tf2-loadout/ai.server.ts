/**
 * The loadout assistant. Server-only: builds the prompt from the catalog, asks the model, and returns
 * only equips that pass {@link validateActions}. Any failure of the model is reported as
 * `unavailable` so the browser can fall back to its own name matching.
 */

import { assertAiBudget } from '@/lib/ai/budget.server';
import { isAiConfigured, runTaskJson } from '@/lib/ai/provider.server';
import { asData, systemFor, TF2_LOADOUT_ASSISTANT } from '@/lib/ai/prompts';
import { AppError } from '@/lib/errors/codes';
import type { Catalog, LoadoutSlots, TfClass } from './catalog-types';
import {
  ASSISTANT_LIMITS,
  describeCandidates,
  describeLoadout,
  describeMatchContext,
  selectCandidates,
  validateActions,
  type AiAction,
  type LoadoutMatchContext,
} from './ai-core';

export interface AssistantTurn {
  role: 'user' | 'assistant';
  content: string;
}

export type AssistantResult =
  | { ok: true; reply: string; actions: AiAction[]; dropped: number }
  | { ok: false; reason: 'unconfigured' | 'failed' | 'empty' };

interface ModelAnswer {
  reply: string;
  actions: unknown;
}

function parseAnswer(value: unknown): ModelAnswer {
  const o = (value ?? {}) as Record<string, unknown>;
  if (typeof o.reply !== 'string') throw new AppError('AI_UNAVAILABLE');
  return { reply: o.reply, actions: o.actions };
}

export async function askLoadoutAssistant(a: {
  userId: string;
  catalog: Catalog;
  cls: TfClass;
  slots: LoadoutSlots;
  message: string;
  history: readonly AssistantTurn[];
  /** The live match from the in-game view. Game-built, but quoted as data like the player's words. */
  match?: LoadoutMatchContext;
}): Promise<AssistantResult> {
  if (!isAiConfigured()) return { ok: false, reason: 'unconfigured' };
  await assertAiBudget(a.userId);

  const candidates = selectCandidates(a.catalog, a.cls, a.message);
  // Trusted, server-built context first; everything the player typed goes inside the data frame.
  const context = [
    `CLASS: ${a.cls}`,
    'CURRENT LOADOUT:',
    describeLoadout(a.catalog, a.slots),
    '',
    describeCandidates(candidates, a.cls),
  ].join('\n');
  const conversation = [
    ...a.history.slice(-ASSISTANT_LIMITS.history).map((t) => `${t.role}: ${t.content}`),
    `player: ${a.message}`,
  ].join('\n');

  // A map name can come from a peer-to-peer host, so the match goes inside a data frame of its own.
  const match = describeMatchContext(a.match);

  try {
    const answer = await runTaskJson(
      'concierge',
      systemFor(TF2_LOADOUT_ASSISTANT),
      `${context}${match ? `\n\nMATCH:\n${asData(match)}` : ''}\n\nCONVERSATION:\n${asData(conversation)}`,
      parseAnswer,
      {
        userId: a.userId,
        promptId: TF2_LOADOUT_ASSISTANT.id,
        promptVer: TF2_LOADOUT_ASSISTANT.version,
        maxTokens: 900,
      },
    );
    const reply = answer.reply.trim().slice(0, 1200);
    const { actions, dropped } = validateActions(a.catalog, a.cls, answer.actions, a.slots);
    if (!reply && !actions.length) return { ok: false, reason: 'empty' };
    return { ok: true, reply, actions, dropped };
  } catch (e) {
    // Budget refusals (and anything else that is not "the model failed") keep their own status.
    if (e instanceof AppError && e.code !== 'AI_UNAVAILABLE') throw e;
    return { ok: false, reason: 'failed' };
  }
}
