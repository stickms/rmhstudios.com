import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { assertAiBudget } from '@/lib/ai/budget.server';
import { asData, CHARACTER_ADVISOR, systemFor } from '@/lib/ai/prompts';
import { isAiConfigured, jsonFromModelText, runTask } from '@/lib/ai/provider.server';
import { AppError } from '@/lib/errors/codes';
import { ADVISOR_LIMITS } from '@features/rmhcharacters/engine/advisor-limits';
import { advisorBody, advisorResponse, modelReply, RECOMMENDATION_KINDS } from '@features/rmhcharacters/engine/advisor-schema';
import type { AdvisorReply } from '@features/rmhcharacters/engine/advisor.contract';
import { askAdvisorApi } from '@features/rmhcharacters/engine/advisor.contract';

const GAME = { dnd5e: 'D&D 5e (2024 rules)', pf2e: 'Pathfinder 2e (Remaster)' } as const;

type Kind = (typeof RECOMMENDATION_KINDS)[number];
const isKind = (k: string): k is Kind => (RECOMMENDATION_KINDS as readonly string[]).includes(k);

/**
 * Read the model's JSON reply leniently. A reply that is not JSON at all is still shown, as
 * prose with no recommendations: a formatting slip should not cost the player the answer.
 */
function readReply(raw: string): AdvisorReply {
  let parsed: unknown;
  try {
    parsed = jsonFromModelText(raw);
  } catch {
    return { answer: raw.trim().slice(0, CHARACTER_ADVISOR.maxChars), recommendations: [] };
  }
  const r = modelReply.safeParse(parsed);
  if (!r.success) return { answer: raw.trim().slice(0, CHARACTER_ADVISOR.maxChars), recommendations: [] };
  const seen = new Set<string>();
  const recommendations: AdvisorReply['recommendations'] = [];
  for (const rec of r.data.recommendations) {
    const name = rec.name?.replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const kind = rec.kind?.toLowerCase().trim() ?? 'other';
    recommendations.push({ kind: isKind(kind) ? kind : 'other', name, why: (rec.why ?? '').trim().slice(0, 600) });
    if (recommendations.length === ADVISOR_LIMITS.recommendations) break;
  }
  return { answer: r.data.answer.trim().slice(0, CHARACTER_ADVISOR.maxChars), recommendations };
}

/**
 * POST /api/rmhcharacters/advisor — answer any question, with this character as context, plus the
 * specific options it recommends (spells, feats, items, …) as structured entries the UI looks up.
 *
 * The sheet and the conversation are written by the client, so all of it is
 * framed as data: the system turn is the registered prompt and nothing else.
 * Signed-in members only, rate limited and budgeted like every model call.
 */
export const route = apiRoute('/api/rmhcharacters/advisor', {
  POST: implement(
    askAdvisorApi,
    {
      rateLimit: { policy: 'ai', limit: 20, prefix: 'rmhc-advisor', scope: 'user' },
      body: advisorBody,
      response: advisorResponse,
    },
    async ({ userId, body }) => {
      if (!isAiConfigured()) throw new AppError('AI_UNAVAILABLE');
      await assertAiBudget(userId);
      const history = body.history
        .map((t) => `${t.role === 'user' ? 'Player' : 'Advisor'}: ${t.content}`)
        .join('\n\n');
      const user = [
        `GAME: ${GAME[body.system]}`,
        '',
        'CHARACTER SHEET:',
        body.sheet,
        '',
        history ? `EARLIER IN THIS CONVERSATION:\n${history}\n` : '',
        `QUESTION: ${body.question}`,
      ].join('\n');
      const raw = await runTask('concierge', systemFor(CHARACTER_ADVISOR), asData(user), {
        userId,
        promptId: CHARACTER_ADVISOR.id,
        promptVer: CHARACTER_ADVISOR.version,
        maxTokens: 2_400,
        json: true,
      });
      const reply = readReply(raw);
      if (!reply.answer && !reply.recommendations.length) throw new AppError('AI_UNAVAILABLE');
      return reply;
    },
  ),
});
