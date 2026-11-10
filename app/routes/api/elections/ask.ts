import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { implement } from '@/lib/api/implement.server';
import { askElectionsApi } from '@/lib/elections/elections.contract';
import { currentCycle, parseDay } from '@/lib/elections/calendar';
import { answerElectionQuestion } from '@/lib/elections/ai.server';
import { getElectionSnapshot } from '@/lib/elections/source.server';
import { isAiConfigured } from '@/lib/ai/provider.server';

const body = z.object({
  question: z.string().trim().min(3).max(300),
  cycle: z.string().max(10).optional(),
});

/** POST /api/elections/ask — answer a question about the results, grounded in the live snapshot. */
export const Route = createFileRoute('/api/elections/ask')({
  server: {
    handlers: {
      POST: implement(askElectionsApi, 
        { rateLimit: 'ai', body, label: 'elections.ask' },
        async ({ userId, body: b }) => {
          if (!isAiConfigured()) return Response.json({ error: 'AI is unavailable' }, { status: 503 });
          const cycle = b.cycle ? parseDay(b.cycle) : currentCycle();
          if (!cycle) return Response.json({ error: 'Unknown election cycle' }, { status: 400 });
          const snapshot = await getElectionSnapshot(cycle);
          if (!snapshot.races.length) {
            return Response.json({ answer: 'There are no ballots published for this election yet.' });
          }
          const answer = await answerElectionQuestion(b.question, snapshot, userId);
          return Response.json({ answer: answer ?? 'I could not answer that from the data I have.' });
        },
      ),
    },
  },
});
