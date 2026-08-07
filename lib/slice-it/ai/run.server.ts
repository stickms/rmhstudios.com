/**
 * Slice It AI — the one call shape every feature in this directory uses.
 *
 * Nine features, one degradation contract: **return `null`, never throw.**
 * Every Slice It AI surface is an addition to a screen that already works — the
 * results card shows a score without coaching, the library filters without a
 * natural-language box, the upload form has fields the uploader can type into.
 * So the correct behaviour when a key is missing, a provider is down, a budget
 * is spent, or a model returns prose where an object was asked for is always
 * the same: render the screen that shipped before the feature existed.
 *
 * Writing that nine times is nine chances to let one of them throw into a
 * results screen and replace a run the player just finished with an error
 * boundary. So it is written once, here.
 *
 * The counterpart obligation is on the caller: a `null` must reach a UI branch
 * that renders something, not an empty panel with a heading. That part cannot
 * be enforced from here.
 */

import type { z } from 'zod';
import { runTaskJson, isAiConfigured, type AiTask } from '@/lib/ai/provider.server';
import { asData, systemFor, type PromptSpec } from '@/lib/ai/prompts';

export { isAiConfigured };

/**
 * Run a prompt over some facts and parse the result, or return `null`.
 *
 * `facts` is always wrapped with `asData`. That is not optional and not a
 * parameter: some of it is genuinely untrusted (song titles, comment bodies,
 * player names, filenames all originate with a member of the public), and the
 * parts that are computed — densities, timing spreads — are only *derived* from
 * user-supplied audio. Deciding per call site which half needs the wrapper is
 * exactly the judgement call that eventually gets made wrong, so the wrapper is
 * unconditional.
 */
export async function attempt<S extends z.ZodType>(
  spec: PromptSpec,
  schema: S,
  facts: string,
  opts: { userId?: string | null; task?: AiTask } = {},
): Promise<z.infer<S> | null> {
  if (!isAiConfigured()) return null;

  try {
    return await runTaskJson(
      opts.task ?? spec.task,
      systemFor(spec),
      asData(facts),
      (value) => schema.parse(value) as z.infer<S>,
      { userId: opts.userId ?? null, promptId: spec.id, promptVer: spec.version },
    );
  } catch (err) {
    // Warn, not error: an unconfigured key and a spent budget are both normal
    // states of this system, and paging on them would train everyone to ignore
    // the log line that matters.
    console.warn(`[slice-it/ai] ${spec.id} failed:`, (err as Error)?.message);
    return null;
  }
}
