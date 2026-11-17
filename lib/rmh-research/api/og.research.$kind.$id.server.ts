import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { renderPageCard, type PageCardData } from '@/lib/og/page-card.server';
import { authorMetrics, authorsOf, fieldStats, getAuthor, getPaper, resonanceOf } from '@/lib/rmh-research/catalog';
import { authorLine } from '@/lib/rmh-research/cite';
import { getField, isFieldId } from '@/lib/rmh-research/fields';
import { researchOgCardApi } from '@/lib/rmh-research/research.contract';

/** The card for one research page, or `null` when the page does not exist. Catalogue data only. */
function cardFor(kind: string, id: string): PageCardData | null {
  if (kind === 'paper') {
    const paper = getPaper(id);
    if (!paper) return null;
    const res = resonanceOf(paper.id);
    return {
      cacheKey: `research:paper:${paper.id}:${res.raw}:${res.score}`,
      eyebrow: 'RMH Research',
      lead: getField(paper.field).name,
      title: paper.title,
      subtitle: `${authorLine(paper, authorsOf(paper))} · ${paper.venue}, ${paper.year}`,
      // Paper ids are long enough that the URL runs off the card; the title says which paper it is.
      path: null,
      stats: [
        { value: String(res.raw), label: 'cited by', lead: true },
        { value: String(res.score), label: 'resonance' },
      ],
    };
  }
  if (kind === 'author') {
    const author = getAuthor(id);
    const m = author && authorMetrics(author.id);
    if (!author || !m) return null;
    return {
      cacheKey: `research:author:${author.id}:${m.r}:${m.h}:${m.papers}`,
      eyebrow: 'RMH Research',
      lead: getField(author.field).name,
      title: author.name,
      subtitle: `${author.role}, ${author.lab}`,
      path: `/rmh-research/authors/${author.id}`,
      stats: [
        { value: String(m.r), label: 'r-index', lead: true },
        { value: String(m.h), label: 'h-index' },
      ],
    };
  }
  if (kind === 'field' && isFieldId(id)) {
    const field = getField(id);
    const s = fieldStats(id);
    return {
      cacheKey: `research:field:${id}:${s?.papers ?? 0}:${s?.r ?? 0}`,
      eyebrow: 'RMH Research',
      title: field.name,
      subtitle: `${s?.papers ?? 0} papers by ${s?.authors ?? 0} authors in the RMH Research archive.`,
      path: `/rmh-research/fields/${id}`,
      stats: [
        { value: String(s?.papers ?? 0), label: 'papers', lead: true },
        { value: String(s?.r ?? 0), label: 'r-index' },
      ],
    };
  }
  return null;
}

/**
 * GET /api/og/research/$kind/$id — the Open Graph card for an RMH Research
 * paper, author or field. Everything drawn comes from the checked-in
 * catalogue, looked up by id; nothing in the URL becomes text on the card. If
 * the render fails, the answer is a redirect to the section's card rather than
 * an error: an unfurl with a generic image is a worse card, one with no image
 * is a broken one.
 */
export const route = apiRoute('/api/og/research/$kind/$id', {
  GET: implement(researchOgCardApi, { auth: 'none', rateLimit: 'read' }, async ({ params }) => {
    const card = cardFor(params.kind, params.id);
    if (!card) return new Response('Not found', { status: 404 });
    try {
      const png = await renderPageCard({ ...card, ttlMs: 24 * 60 * 60 * 1000 });
      return new Response(new Uint8Array(png), {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
        },
      });
    } catch {
      return new Response(null, {
        status: 302,
        headers: { Location: '/api/og/section/rmh-research', 'Cache-Control': 'public, max-age=300' },
      });
    }
  }),
});
