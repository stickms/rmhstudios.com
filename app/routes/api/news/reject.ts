import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { newsActionHeaders, newsConfirmationHtml, verifyNewsApprovalToken } from '@/lib/news-approval.server';

export const Route = createFileRoute('/api/news/reject')({ server: { handlers: {
  GET: async ({ request }) => {
    const url = new URL(request.url); const slug = url.searchParams.get('slug') ?? ''; const token = url.searchParams.get('token') ?? '';
    if (!verifyNewsApprovalToken('reject', slug, token)) return Response.json({ error: 'Invalid or expired token' }, { status: 403, headers: newsActionHeaders('application/json') });
    return new Response(newsConfirmationHtml('reject', slug, token), { headers: newsActionHeaders() });
  },
  POST: async ({ request }) => {
    const form = await request.formData(); const slug = String(form.get('slug') ?? ''); const token = String(form.get('token') ?? '');
    if (!verifyNewsApprovalToken('reject', slug, token)) return Response.json({ error: 'Invalid or expired token' }, { status: 403, headers: newsActionHeaders('application/json') });
    const article = await prisma.newsArticle.findUnique({ where: { slug } });
    if (!article) return Response.json({ error: 'Article not found' }, { status: 404, headers: newsActionHeaders('application/json') });
    await prisma.newsArticle.delete({ where: { slug } });
    return new Response(`Article "${slug}" was rejected and deleted.`, { headers: newsActionHeaders('text/plain; charset=utf-8') });
  },
} } });
