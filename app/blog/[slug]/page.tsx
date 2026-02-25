import { getPostBySlug, getPostSlugs } from "@/lib/blog";
import { MDXRemote } from "next-mdx-remote/rsc";
import Link from "next/link";
import { ArrowLeft, Calendar } from "lucide-react";
import { ShareButton } from "@/components/blog/ShareButton";

import {
  AnimatedH1, AnimatedH2, AnimatedH3, AnimatedP,
  AnimatedUl, AnimatedOl, AnimatedLi,
  AnimatedBlockquote, AnimatedImg, AnimatedHr, AnimatedPre
} from "@/components/blog/MDXAnimations";

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

export async function generateStaticParams() {
  const posts = getPostSlugs();
  return posts.map((post) => ({
    slug: post.replace(/\.mdx$/, ""),
  }));
}

import type { Metadata } from "next";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug, ["title", "description"]);

  return {
    title: `${post.title} | RMH Studios Devlog`,
    description: post.description,
  };
}

export default async function BlogPost({ params }: Props) {
  const { slug } = await params;
  const post = getPostBySlug(slug, ["title", "date", "description", "content"]);

  return (
    <article className="min-h-screen pt-32 pb-20 px-4 bg-site-bg relative overflow-hidden">
        <div className="container mx-auto max-w-3xl relative z-10">
            <Link href="/blog" className="inline-flex items-center gap-2 text-site-text-dim hover:text-site-text mb-8 transition-colors animate-in fade-in slide-in-from-left-4 duration-700">
                <ArrowLeft className="w-4 h-4" /> Back to Logs
            </Link>

            <header className="mb-12">
                <div className="flex items-center justify-between mb-4 animate-in fade-in slide-in-from-bottom-4 duration-700 fill-mode-both">
                    <div className="flex items-center gap-2 text-site-accent font-mono">
                        <Calendar className="w-5 h-5" />
                        {post.date}
                    </div>
                    <ShareButton slug={slug} />
                </div>
                <h1 className="text-4xl md:text-5xl font-black text-site-text mb-6 tracking-tight leading-tight font-(family-name:--font-nunito) animate-in fade-in slide-in-from-bottom-6 duration-700 delay-150 fill-mode-both">
                    {post.title}
                </h1>
                <p className="text-xl text-site-text-muted leading-relaxed border-l-4 border-site-accent pl-6 animate-in fade-in slide-in-from-bottom-6 duration-700 delay-300 fill-mode-both">
                    {post.description}
                </p>
            </header>

            <div className="prose prose-invert prose-lg max-w-none prose-headings:font-bold prose-headings:text-site-text prose-p:text-site-text-muted prose-a:text-site-accent hover:prose-a:text-site-accent-hover prose-img:rounded-xl prose-img:border prose-img:border-site-border">
                <MDXRemote source={post.content} components={animatedComponents} />
            </div>

            <hr className="my-12 border-site-border" />

            <div className="text-center">
                 <p className="text-site-text-dim italic">End of Log</p>
            </div>
        </div>
    </article>
  );
}
