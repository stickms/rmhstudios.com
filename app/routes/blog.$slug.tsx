/**
 * Blog Post Route
 */

import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getPostBySlug } from '@/lib/blog';
import { buildCanonical, SITE_URL } from '@/lib/seo';
import { articleSchema, jsonLdScript } from '@/lib/schema';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Calendar, Megaphone } from 'lucide-react';
import { ShareButton } from '@/components/blog/ShareButton';
import { liquidVTName } from '@/lib/view-transition';
import { BlogMarkdown } from '@/components/blog/BlogMarkdown';
import { getBusiness } from '@/lib/businesses';

const fetchPost = createServerFn({ method: 'GET' })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const post = await getPostBySlug(slug, ['title', 'date', 'description', 'content', 'announcement', 'business']);
    return post;
  });

const fetchPostMeta = createServerFn({ method: 'GET' })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const post = await getPostBySlug(slug, ['title', 'description']);
    return { title: post.title, description: post.description as string };
  });

export const Route = createFileRoute('/blog/$slug')({
  loader: ({ params }) => fetchPost({ data: params.slug }),
  head: ({ loaderData, params }) => ({
    meta: [
      { title: `${loaderData?.title ?? 'Post'} | RMH Studios Devlog` },
      { name: 'description', content: (loaderData?.description as string) ?? '' },
    ],
    links: [
      buildCanonical(`/blog/${params.slug}`),
      { rel: 'alternate', type: 'application/rss+xml', title: 'RMH Studios — Blog', href: `${SITE_URL}/blog/rss.xml` },
    ],
    scripts: loaderData
      ? [
          jsonLdScript(
            articleSchema({
              title: loaderData.title as string,
              description: loaderData.description as string | undefined,
              datePublished: loaderData.date as string | undefined,
              path: `/blog/${params.slug}`,
              type: 'BlogPosting',
            }),
          ),
        ]
      : [],
  }),
  component: BlogPost,
});

function BlogPost() {
  const post = Route.useLoaderData();
  const { slug } = Route.useParams();
  const { t } = useTranslation("pages");

  return (
    <article className="min-h-screen pt-20 pb-20 px-4 bg-site-bg relative overflow-hidden">
      <div className="container mx-auto max-w-3xl relative z-10">
        <Link to="/library" className="inline-flex items-center gap-2 text-site-text-dim hover:text-site-text mb-8 transition-colors animate-in fade-in slide-in-from-left-4 duration-700">
          <ArrowLeft className="w-4 h-4" /> {t("back-to-logs", { defaultValue: "Back to Logs" })}
        </Link>

        {/* §5.48 liquid-open hero — the blog card morphs into this header. */}
        <header className="mb-12" style={{ viewTransitionName: liquidVTName('blog', slug) }}>
          <div className="flex items-center justify-between mb-4 animate-in fade-in slide-in-from-bottom-4 duration-700 fill-mode-both">
            <div className="flex items-center gap-2 text-site-accent font-mono">
              <Calendar className="w-5 h-5" />
              {post.date}
            </div>
            <ShareButton slug={slug} />
          </div>
          {(post as { announcement?: unknown }).announcement === true && (
            <p className="mb-4 inline-flex items-center gap-2 rounded-site-sm border border-site-accent/30 bg-site-accent-dim px-3 py-1 text-sm font-medium text-site-accent">
              <Megaphone className="h-4 w-4" aria-hidden />
              <span>
                {getBusiness((post as { business?: string }).business).name}
                {' · '}
                {t('announcement-badge', { defaultValue: 'Announcement' })}
              </span>
            </p>
          )}
          <h1 className="text-4xl md:text-5xl font-black text-site-text mb-6 tracking-tight leading-tight font-(family-name:--site-font-display) animate-in fade-in slide-in-from-bottom-6 duration-700 delay-150 fill-mode-both">
            {post.title}
          </h1>
          <p className="text-xl text-site-text-muted leading-relaxed border-l-4 border-site-accent pl-6 animate-in fade-in slide-in-from-bottom-6 duration-700 delay-300 fill-mode-both">
            {post.description}
          </p>
        </header>

        <BlogMarkdown content={post.content as string} />

        <hr className="my-12 border-site-border" />

        <div className="text-center">
          <p className="text-site-text-dim italic">{t("end-of-log", { defaultValue: "End of Log" })}</p>
        </div>
      </div>
    </article>
  );
}
