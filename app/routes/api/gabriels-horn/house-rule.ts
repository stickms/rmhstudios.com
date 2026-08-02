import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { withRateLimit } from '@/lib/rate-limit';
import { proposeRuleAmendment } from '@/lib/ai/text.server';
import {
  DEFAULT_HOUSE_RULES,
  HOUSE_RULE_BOUNDS,
  clampHouseRules,
  diffHouseRules,
  heuristicHouseRules,
  type HouseRules,
} from '@/lib/gabriels-horn/house-rules';

/**
 * Gabriel's Horn — "change the rules by asking".
 *
 * A player describes what is wrong with the game in their own words; this turns
 * that into a concrete amendment to the table's tunable rules.
 *
 * ── The two guarantees ─────────────────────────────────────────────────────
 *
 * **It cannot make up a rule.** The model only ever fills in the fixed knob
 * schema in `lib/gabriels-horn/house-rules.ts`, and whatever it returns goes
 * through `clampHouseRules` before anyone sees it. A hallucinated key is
 * dropped; an out-of-range number is pinned; a prompt-injected instruction in
 * the wish (or in the table chat the wish quotes) has no field to express
 * itself in. The socket handler clamps the result a SECOND time when it applies
 * it, so this endpoint is a convenience, not a trust boundary — a client that
 * skipped it entirely could only ever set legal values anyway.
 *
 * **It cannot fail.** `proposeRuleAmendment` returns `rules: null` for every
 * failure mode there is — no API key, upstream down, timeout, refusal,
 * unparseable body — and this route answers that with
 * {@link heuristicHouseRules}, a real deterministic balancer over the same two
 * inputs. So the endpoint has one success shape and no error path a player can
 * reach: `source` says which arm produced the answer and the UI is honest about
 * it, but there is always an answer.
 */

const snapshotSchema = z.object({
  playerCount: z.coerce.number().int().min(1).max(12).default(2),
  round: z.coerce.number().int().min(1).max(999).default(1),
  turnsTaken: z.coerce.number().int().min(0).max(9999).default(0),
  handCounts: z.array(z.coerce.number().int().min(0).max(200)).max(12).default([]),
  callsMade: z.coerce.number().int().min(0).max(9999).default(0),
  callsCorrect: z.coerce.number().int().min(0).max(9999).default(0),
});

const bodySchema = z.object({
  prompt: z.string().min(1).max(400),
  /** The table's rules right now. Clamped before use — never trusted as given. */
  current: z.unknown().optional(),
  state: snapshotSchema.optional(),
});

export interface HouseRuleProposal {
  rules: HouseRules;
  changes: { key: string; from: string; to: string }[];
  reasoning: string;
  /** Which arm produced this — the model, or the deterministic balancer. */
  source: 'ai' | 'fallback';
}

export const Route = createFileRoute('/api/gabriels-horn/house-rule')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        // The `ai` policy, keyed per user as well as per IP: this spends money
        // upstream, and one table should not be able to hammer it.
        const limited = withRateLimit(request, 'ai', { scope: session.user.id });
        if (limited) return limited;

        const body = await request.json().catch(() => ({}));
        const parsed = bodySchema.safeParse(body);
        if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });

        const wish = parsed.data.prompt.trim();
        const current = clampHouseRules(parsed.data.current, DEFAULT_HOUSE_RULES);
        const state = parsed.data.state ?? snapshotSchema.parse({});

        const draft = await proposeRuleAmendment({
          wish,
          context: {
            game: "Gabriel's Horn — a blind-dice bluffing card game. Fewest cards wins.",
            current,
            bounds: HOUSE_RULE_BOUNDS,
            booleanKnobs: {
              hornMustBeStrictlyLowest:
                'true = whoever calls the End must hold strictly fewest or they finish last; false = a tie is good enough (much gentler)',
              swapEnabled: 'whether a seven still trades your whole hand with another player',
              'effects.azure': 'Glimpse — see your own dice this turn',
              'effects.crimson': 'Accuse — a chosen player draws',
              'effects.verdant': 'Ward — you cannot be made to draw until your next turn',
              'effects.amber': "Scry — look at a player's hand",
            },
            table: state,
            wish,
          },
        });

        // The model answered with something shaped like rules. Clamp it against
        // the CURRENT rules, so keys it left out simply stay as they were.
        if (draft.rules) {
          const rules = clampHouseRules({ ...current, ...draft.rules }, current);
          const changes = diffHouseRules(current, rules);
          if (changes.length > 0) {
            const proposal: HouseRuleProposal = {
              rules,
              changes,
              reasoning: draft.reasoning || 'Adjusted to balance the table.',
              source: 'ai',
            };
            return Response.json(proposal);
          }
          // It understood the request and concluded nothing should move — or it
          // returned only out-of-range values that clamped back to the status
          // quo. Either way there is no amendment, so fall through and let the
          // deterministic arm try; a player who asked for a change deserves one.
        }

        const fallback = heuristicHouseRules(wish, state, current);
        const proposal: HouseRuleProposal = {
          rules: fallback.rules,
          changes: diffHouseRules(current, fallback.rules),
          reasoning: fallback.reasoning,
          source: 'fallback',
        };
        return Response.json(proposal);
      },
    },
  },
});
