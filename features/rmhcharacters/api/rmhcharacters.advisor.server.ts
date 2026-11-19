import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { assertAiBudget } from '@/lib/ai/budget.server';
import { asData, CHARACTER_ADVISOR, systemFor } from '@/lib/ai/prompts';
import { isAiConfigured, runTask } from '@/lib/ai/provider.server';
import { AppError } from '@/lib/errors/codes';
import { advisorBody, advisorResponse } from '@features/rmhcharacters/engine/advisor-schema';
import { askAdvisorApi } from '@features/rmhcharacters/engine/advisor.contract';

const GAME = { dnd5e: 'D&D 5e (2024 rules)', pf2e: 'Pathfinder 2e (Remaster)' } as const;

/**
 * POST /api/rmhcharacters/advisor — answer a question about one character.
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
        maxTokens: 1_600,
      });
      const answer = raw.trim().slice(0, CHARACTER_ADVISOR.maxChars);
      if (!answer) throw new AppError('AI_UNAVAILABLE');
      return { answer };
    },
  ),
});
