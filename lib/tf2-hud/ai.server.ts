/**
 * The HUD assistant, server half. Two small calls: choose which files a request touches, then
 * propose key-level changes to the files the editor sends back. Nothing here writes anything; the
 * editor applies the changes with its own edits after the player has seen them.
 */

import { assertAiBudget } from '@/lib/ai/budget.server';
import { isAiConfigured, runTaskJson } from '@/lib/ai/provider.server';
import { asData, systemFor, TF2_HUD_EDIT, TF2_HUD_SELECT } from '@/lib/ai/prompts';
import { AppError } from '@/lib/errors/codes';
import { HUD_AI_LIMITS, parseChanges, validateSelection, type HudChange } from './ai-core';

export interface HudTurn {
  role: 'user' | 'assistant';
  content: string;
}

export type SelectResult =
  { ok: true; files: string[] } | { ok: false; reason: 'unconfigured' | 'failed' };

export type ProposeResult =
  | { ok: true; summary: string; changes: HudChange[]; malformed: number }
  | { ok: false; reason: 'unconfigured' | 'failed' | 'empty' };

const conversation = (message: string, history: readonly HudTurn[]): string =>
  asData(
    [
      ...history.slice(-HUD_AI_LIMITS.history).map((t) => `${t.role}: ${t.content}`),
      `player: ${message}`,
    ].join('\n'),
  );

/** Budget refusals keep their own status; any other failure means "the model could not help". */
const failed = (e: unknown): { ok: false; reason: 'failed' } => {
  if (e instanceof AppError && e.code !== 'AI_UNAVAILABLE') throw e;
  return { ok: false, reason: 'failed' };
};

export async function selectHudFiles(a: {
  userId: string;
  message: string;
  paths: readonly string[];
  history: readonly HudTurn[];
}): Promise<SelectResult> {
  if (!isAiConfigured()) return { ok: false, reason: 'unconfigured' };
  await assertAiBudget(a.userId);
  const allowed = new Set(a.paths);
  try {
    const files = await runTaskJson(
      'moderate',
      systemFor(TF2_HUD_SELECT),
      `HUD FILES:\n${a.paths.join('\n')}\n\nREQUEST:\n${conversation(a.message, a.history)}`,
      (v) => validateSelection((v as { files?: unknown } | null)?.files, allowed),
      { userId: a.userId, promptId: TF2_HUD_SELECT.id, promptVer: TF2_HUD_SELECT.version },
    );
    return { ok: true, files };
  } catch (e) {
    return failed(e);
  }
}

export async function proposeHudChanges(a: {
  userId: string;
  message: string;
  files: readonly { path: string; text: string }[];
  history: readonly HudTurn[];
  /** What the player has selected or is looking at (built by the editor from their own project), as data. */
  context?: string;
}): Promise<ProposeResult> {
  if (!isAiConfigured()) return { ok: false, reason: 'unconfigured' };
  await assertAiBudget(a.userId);
  const shown = a.files.map((f) => f.path);
  const body = a.files.map((f) => `=== FILE: ${f.path} ===\n${f.text}`).join('\n\n');
  try {
    const answer = await runTaskJson(
      'concierge',
      systemFor(TF2_HUD_EDIT),
      `${body}${a.context ? `\n\nSELECTED:\n${asData(a.context)}` : ''}\n\nREQUEST:\n${conversation(a.message, a.history)}`,
      (v) => {
        const o = (v ?? {}) as Record<string, unknown>;
        if (typeof o.summary !== 'string') throw new AppError('AI_UNAVAILABLE');
        return { summary: o.summary, ...parseChanges(o.changes) };
      },
      {
        userId: a.userId,
        promptId: TF2_HUD_EDIT.id,
        promptVer: TF2_HUD_EDIT.version,
        maxTokens: 2500,
      },
    );
    // A change to a file the model was not shown is dropped by the editor too; filtering here keeps
    // the response honest about what it carries.
    const changes = answer.changes.filter((c) => shown.includes(c.file));
    const summary = answer.summary.trim().slice(0, 1000);
    if (!summary && !changes.length) return { ok: false, reason: 'empty' };
    return {
      ok: true,
      summary,
      changes,
      malformed: answer.malformed + (answer.changes.length - changes.length),
    };
  } catch (e) {
    return failed(e);
  }
}
