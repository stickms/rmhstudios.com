'use client';

import type { ComponentProps, ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import { cn } from '@/lib/utils';
import { classifyMedia } from '@/lib/blog-media';
import {
  AnimatedH1, AnimatedH2, AnimatedH3, AnimatedP,
  AnimatedUl, AnimatedOl, AnimatedLi,
  AnimatedBlockquote, AnimatedHr, AnimatedPre,
} from '@/components/blog/MDXAnimations';

// The animated primitives ship white-on-dark defaults; the overrides below
// (merged with tailwind-merge in `cn`) swap them for --site-* tokens so the
// same markdown reads correctly in every theme, including `light`.
type ThemedProps = { node?: unknown; className?: string; children?: ReactNode } & Record<string, unknown>;
const withClass = (extra: string) =>
  function Themed(Comp: React.ComponentType<ThemedProps>) {
    return function ThemedEl({ node: _node, className, ...props }: ThemedProps) {
      return <Comp {...props} className={cn(extra, className)} />;
    };
  };

const H1 = withClass('text-site-text')(AnimatedH1);
const H2 = withClass('text-site-text')(AnimatedH2);
const H3 = withClass('text-site-text')(AnimatedH3);
const Ul = withClass('text-site-text-muted')(AnimatedUl);
const Ol = withClass('text-site-text-muted')(AnimatedOl);
const Li = withClass('')(AnimatedLi);
const Quote = withClass('text-site-text bg-site-surface-hover border-site-accent')(AnimatedBlockquote);
const Hr = withClass('border-site-border')(AnimatedHr);
const Pre = withClass('bg-site-surface-hover border-site-border text-site-text')(AnimatedPre);

const mediaFrame = 'my-8 w-full max-w-full overflow-hidden rounded-site border border-site-border bg-site-surface-hover';

function Paragraph({ node, className, children, ...props }: ThemedProps) {
  const kids = (node as { children?: { tagName?: string }[] } | undefined)?.children;
  const hasMedia = Array.isArray(kids) && kids.some((c) => c?.tagName === 'img');
  if (hasMedia) {
    // Block media (video/iframe/figure) is invalid inside <p>.
    return <div className={cn('mb-6 text-lg leading-relaxed text-site-text-muted', className)}>{children}</div>;
  }
  return (
    <AnimatedP {...props} className={cn('text-site-text-muted', className)}>
      {children}
    </AnimatedP>
  );
}

function Media({ src, alt, ...props }: ComponentProps<'img'>) {
  const source = typeof src === 'string' ? src : '';
  const media = classifyMedia(source);

  if (media.kind === 'video') {
    return (
      <figure className={mediaFrame}>
        <video
          controls
          playsInline
          preload="metadata"
          src={media.src}
          aria-label={alt || undefined}
          className="block h-auto w-full max-w-full"
        />
        {alt && <figcaption className="p-2 text-center font-mono text-xs text-site-text-dim">{alt}</figcaption>}
      </figure>
    );
  }

  if (media.kind === 'youtube') {
    return (
      <figure className={mediaFrame}>
        <div className="aspect-video w-full">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${media.videoId}`}
            title={alt || 'YouTube video'}
            loading="lazy"
            allowFullScreen
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            referrerPolicy="strict-origin-when-cross-origin"
            className="h-full w-full border-0"
          />
        </div>
        {alt && <figcaption className="p-2 text-center font-mono text-xs text-site-text-dim">{alt}</figcaption>}
      </figure>
    );
  }

  return (
    <figure className={mediaFrame}>
      <img {...props} src={src} alt={alt ?? ''} loading="lazy" className="mx-auto block h-auto max-w-full" />
      {alt && <figcaption className="p-2 text-center font-mono text-xs text-site-text-dim">{alt}</figcaption>}
    </figure>
  );
}

function Anchor({ node: _node, className, children, ...props }: ComponentProps<'a'> & { node?: unknown }) {
  return (
    <a
      {...props}
      className={cn('text-site-accent underline underline-offset-2 hover:text-site-accent-hover', className)}
    >
      {children}
    </a>
  );
}

const components = {
  h1: H1,
  h2: H2,
  h3: H3,
  p: Paragraph,
  ul: Ul,
  ol: Ol,
  li: Li,
  blockquote: Quote,
  img: Media,
  a: Anchor,
  hr: Hr,
  pre: Pre,
} as unknown as Components;

const proseClasses =
  'prose prose-lg max-w-none break-words text-site-text-muted prose-code:break-words prose-headings:font-bold prose-headings:text-site-text prose-p:text-site-text-muted prose-a:text-site-accent hover:prose-a:text-site-accent-hover';

/**
 * Renders blog/announcement markdown with the site's animated elements.
 * No raw HTML is allowed. Images whose URL is a video file or a YouTube link
 * become <video> / privacy-friendly embeds (see lib/blog-media).
 */
export function BlogMarkdown({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn(proseClasses, className)}>
      <ReactMarkdown components={components}>{content}</ReactMarkdown>
    </div>
  );
}
