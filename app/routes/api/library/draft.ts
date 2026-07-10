import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { draftLibraryMetadata, isAITextConfigured } from '@/lib/ai/text.server';

/**
 * POST /api/library/draft — draft a title + description from the opening text of
 * a PDF (extracted client-side). Returns blank fields when AI is unconfigured so
 * the upload form falls back to a filename-derived title.
 */
export const Route = createFileRoute('/api/library/draft')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }
        // Admins are unlimited (bulk drafting); regular users are rate-limited.
        const isAdmin = Boolean((session.user as { isAdmin?: boolean }).isAdmin);
        if (!isAdmin) {
          const ip = getClientIp(request);
          const { allowed, retryAfter } = rateLimit(ip, {
            limit: 30,
            windowMs: 10 * 60_000,
            prefix: 'library-draft',
          });
          if (!allowed) {
            return Response.json(
              { error: 'Too many requests.' },
              { status: 429, headers: { 'Retry-After': String(retryAfter) } }
            );
          }
        }
        if (!isAITextConfigured()) {
          return Response.json({ title: '', description: '' });
        }
        let text = '';
        try {
          const body = await request.json();
          if (typeof body?.text === 'string') text = body.text;
        } catch {
          /* ignore malformed body */
        }
        if (!text.trim()) return Response.json({ title: '', description: '' });
        const draft = await draftLibraryMetadata(text);
        return Response.json(draft);
      },
    },
  },
});
