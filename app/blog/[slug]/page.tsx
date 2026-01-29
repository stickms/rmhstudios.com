import { getPostBySlug, getPostSlugs } from "@/lib/blog";
import { MDXRemote } from "next-mdx-remote/rsc";
import Link from "next/link";
import { ArrowLeft, Calendar } from "lucide-react";
import { ShareButton } from "@/components/blog/ShareButton";
import { ProximityText } from "@/components/ui/ProximityText";

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

// Correctly typing params as a Promise for Next.js 15+ (and 16)
import type { Metadata } from "next";

// ... imports

// ...

// Correctly typing params as a Promise for Next.js 15+ (and 16)
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
    <article className="min-h-screen pt-32 pb-20 px-4 bg-black relative overflow-hidden">
        {/* Ambient background */}
        <div className="absolute top-0 left-0 w-full h-[50vh] bg-gradient-to-b from-[var(--neon-purple)]/10 to-transparent pointer-events-none" />

        <div className="container mx-auto max-w-3xl relative z-10">
            <Link href="/blog" className="inline-flex items-center gap-2 text-white/50 hover:text-white mb-8 transition-colors animate-in fade-in slide-in-from-left-4 duration-700">
                <ArrowLeft className="w-4 h-4" /> Back to Logs
            </Link>

            <header className="mb-12">
                <div className="flex items-center justify-between mb-4 animate-in fade-in slide-in-from-bottom-4 duration-700 fill-mode-both">
                    <div className="flex items-center gap-2 text-[var(--neon-cyan)] font-mono">
                        <Calendar className="w-5 h-5" />
                        {post.date}
                    </div>
                    <ShareButton slug={slug} />
                </div>
                <h1 className="text-4xl md:text-5xl font-black text-white mb-6 tracking-tight leading-tight animate-in fade-in slide-in-from-bottom-6 duration-700 delay-150 fill-mode-both">
                    <ProximityText>{post.title}</ProximityText>
                </h1>
                <p className="text-xl text-white/60 leading-relaxed border-l-4 border-[var(--neon-pink)] pl-6 animate-in fade-in slide-in-from-bottom-6 duration-700 delay-300 fill-mode-both">
                    {post.description}
                </p>
            </header>

            <div className="prose prose-invert prose-lg max-w-none prose-headings:font-bold prose-headings:text-white prose-p:text-white/80 prose-a:text-[var(--neon-cyan)] hover:prose-a:text-[var(--neon-pink)] prose-img:rounded-xl prose-img:border prose-img:border-white/10">
                <MDXRemote source={post.content} components={animatedComponents} />
            </div>
            
            <hr className="my-12 border-white/10" />
            
            <div className="text-center">
                 <p className="text-white/40 italic">End of Log</p>
            </div>
        </div>
    </article>
  );
}
