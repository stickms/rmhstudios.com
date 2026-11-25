/**
 * The loader's question for `/predictions`, `/wager/$id` and `/compete`: is the viewer self-excluded, and until when.
 *
 * A server function so the answer is in the server-rendered page. It guards inside its handler by reading the session
 * itself: it takes no input, acts on `session.user.id` only, and a signed-out call answers "not excluded" (nobody
 * signed out can be excluded, so there is nothing to refuse). The server-only modules load inside the handler.
 */
import { createServerFn } from '@tanstack/react-start';
import type { ExclusionNotice } from '@/lib/economy/risk-surfaces';

export const fetchExclusionNotice = createServerFn({ method: 'GET' }).handler(async (): Promise<ExclusionNotice> => {
  const { getRequestSession } = await import('@/lib/auth-session.server');
  const { readExclusionNotice } = await import('@/lib/economy/exclusion-page.server');
  const session = await getRequestSession();
  return readExclusionNotice(session?.user?.id ?? null);
});
