import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { newsActionHeaders, newsConfirmationHtml, verifyNewsApprovalToken } from '@/lib/news-approval.server';
import { pingIndexNow } from '@/lib/seo/indexnow.server';

export const Route = createFileRoute('/api/news/approve')({ server: { handlers: {
  GET: async ({ request }) => {
    const url = new URL(request.url); const slug = url.searchParams.get('slug') ?? ''; const token = url.searchParams.get('token') ?? '';
    if (!verifyNewsApprovalToken('approve', slug, token)) return Response.json({ error: 'Invalid or expired token' }, { status: 403, headers: newsActionHeaders('application/json') });
    return new Response(newsConfirmationHtml('approve', slug, token), { headers: newsActionHeaders() });
  },
  POST: async ({ request }) => {
    const form = await request.formData(); const slug = String(form.get('slug') ?? ''); const token = String(form.get('token') ?? '');
    if (!verifyNewsApprovalToken('approve', slug, token)) return Response.json({ error: 'Invalid or expired token' }, { status: 403, headers: newsActionHeaders('application/json') });
    const article = await prisma.newsArticle.findUnique({ where: { slug } });
    if (!article) return Response.json({ error: 'Article not found' }, { status: 404, headers: newsActionHeaders('application/json') });
    await prisma.newsArticle.update({ where: { slug }, data: { status: 'PUBLISHED' } });
    // This is THE moment a news article becomes publicly reachable: the sitemap
    // and /news/$slug both gate on status === 'PUBLISHED', and this is the only
    // place in the web tier that sets it. Fire-and-forget — never awaited.
    pingIndexNow([`/news/${slug}`]);
    return new Response(`Article "${slug}" is now published.`, { headers: newsActionHeaders('text/plain; charset=utf-8') });
  },
} } });
