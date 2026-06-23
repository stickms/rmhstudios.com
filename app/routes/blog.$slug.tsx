/**
 * Blog Post Route
 */

import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getPostBySlug } from '@/lib/blog';
import ReactMarkdown from 'react-markdown';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Calendar } from 'lucide-react';
import { ShareButton } from '@/components/blog/ShareButton';
import {
  AnimatedH1, AnimatedH2, AnimatedH3, AnimatedP,
  AnimatedUl, AnimatedOl, AnimatedLi,
  AnimatedBlockquote, AnimatedImg, AnimatedHr, AnimatedPre,
} from '@/components/blog/MDXAnimations';

const animatedComponents = {
  h1: AnimatedH1,
  h2: AnimatedH2,
  h3: AnimatedH3,
  p: AnimatedP,
  ul: AnimatedUl,
  ol: AnimatedOl,
  li: AnimatedLi,
  blockquote: AnimatedBlockquote,
  img: AnimatedImg,
  hr: AnimatedHr,
  pre: AnimatedPre,
};

const fetchPost = createServerFn({ method: 'GET' })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const post = await getPostBySlug(slug, ['title', 'date', 'description', 'content']);
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
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.title ?? 'Post'} | RMH Studios Devlog` },
      { name: 'description', content: loaderData?.description as string ?? '' },
    ],
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
        <Link to="/blog" className="inline-flex items-center gap-2 text-site-text-dim hover:text-site-text mb-8 transition-colors animate-in fade-in slide-in-from-left-4 duration-700">
          <ArrowLeft className="w-4 h-4" /> {t("back-to-logs", { defaultValue: "Back to Logs" })}
        </Link>

        <header className="mb-12">
          <div className="flex items-center justify-between mb-4 animate-in fade-in slide-in-from-bottom-4 duration-700 fill-mode-both">
            <div className="flex items-center gap-2 text-site-accent font-mono">
              <Calendar className="w-5 h-5" />
              {post.date}
            </div>
            <ShareButton slug={slug} />
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-site-text mb-6 tracking-tight leading-tight font-(family-name:--site-font-display) animate-in fade-in slide-in-from-bottom-6 duration-700 delay-150 fill-mode-both">
            {post.title}
          </h1>
          <p className="text-xl text-site-text-muted leading-relaxed border-l-4 border-site-accent pl-6 animate-in fade-in slide-in-from-bottom-6 duration-700 delay-300 fill-mode-both">
            {post.description}
          </p>
        </header>

        <div className="prose prose-invert prose-lg max-w-none prose-headings:font-bold prose-headings:text-site-text prose-p:text-site-text-muted prose-a:text-site-accent hover:prose-a:text-site-accent-hover prose-img:rounded-xl prose-img:border prose-img:border-site-border">
          <ReactMarkdown components={animatedComponents}>{post.content as string}</ReactMarkdown>
        </div>

        <hr className="my-12 border-site-border" />

        <div className="text-center">
          <p className="text-site-text-dim italic">{t("end-of-log", { defaultValue: "End of Log" })}</p>
        </div>
      </div>
    </article>
  );
}
