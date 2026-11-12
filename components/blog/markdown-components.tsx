import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * The markdown element map shared by the article surfaces (`/blog/$slug`,
 * `/news/$slug`, and the admin editor's live preview).
 *
 * This map is the ONLY styling channel for article prose. Those routes used to
 * wrap the markdown in `prose prose-invert prose-lg …`, but
 * `@tailwindcss/typography` is not a dependency of this repo — every `prose-*`
 * class is inert, so anything this map does not name renders unstyled. That is
 * why `a`, `code`, `strong`, `em`, `h4` and the table elements are here
 * alongside the block elements: without them, a link in a post paints the
 * browser's default blue on a themed surface.
 *
 * Every rule reads from the `--site-*` contract (design-language.md §0.1). The
 * old map hardcoded `text-white`, `bg-black/50`, `border-white/10` and the
 * `--neon-*` accents, so an article was legible on the dark default and washed
 * out on the light theme.
 */
type El<T extends keyof React.JSX.IntrinsicElements> = ComponentPropsWithoutRef<T>;

/*
 * Steel section 10, Article. The article is a spine of its table of contents: each section heading (`h2`) is a station
 * (a heading with a hollow dot, `spine-station`), and the paragraphs, lists, quotes and figures under it hang on the
 * spine as dotless items in `t-prose`. The spine itself is the `.spine` class on the article container
 * (`components/reading/ArticleBody.tsx`, the admin preview); nothing here animates (M6) and nothing is boxed (R3).
 */

export const MdH1 = ({ className, children, ...props }: El<'h1'>) => (
  <h1 className={cn('t-title mt-10 mb-4 first:mt-0', className)} {...props}>
    {children}
  </h1>
);

export const MdH2 = ({ className, children, ...props }: El<'h2'>) => (
  <h2 className={cn('spine-station t-label', className)} {...props}>
    {children}
  </h2>
);

export const MdH3 = ({ className, children, ...props }: El<'h3'>) => (
  <h3 className={cn('t-heading mt-8 mb-2 first:mt-0', className)} {...props}>
    {children}
  </h3>
);

export const MdH4 = ({ className, children, ...props }: El<'h4'>) => (
  <h4 className={cn('t-body mt-6 mb-2 font-semibold first:mt-0', className)} {...props}>
    {children}
  </h4>
);

export const MdP = ({ className, ...props }: El<'p'>) => (
  <p className={cn('t-prose mb-4 text-site-text', className)} {...props} />
);

export const MdUl = ({ className, ...props }: El<'ul'>) => (
  <ul
    className={cn('t-prose mb-4 ms-5 list-outside list-disc space-y-1.5 text-site-text', className)}
    {...props}
  />
);

export const MdOl = ({ className, ...props }: El<'ol'>) => (
  <ol
    className={cn(
      't-prose mb-4 ms-5 list-outside list-decimal space-y-1.5 text-site-text',
      className,
    )}
    {...props}
  />
);

export const MdLi = ({ className, ...props }: El<'li'>) => (
  <li className={cn('ps-1', className)} {...props} />
);

export const MdBlockquote = ({ className, ...props }: El<'blockquote'>) => (
  <blockquote
    className={cn(
      't-prose my-6 border-s border-site-border py-1 ps-4 text-site-text-muted',
      className,
    )}
    {...props}
  />
);

export const MdHr = ({ className, ...props }: El<'hr'>) => (
  <hr className={cn('my-8 border-site-border', className)} {...props} />
);

export const MdPre = ({ className, ...props }: El<'pre'>) => (
  <pre
    className={cn(
      'mb-4 overflow-x-auto rounded-site border border-site-border bg-site-bg-subtle p-4 text-sm text-site-text',
      className,
    )}
    {...props}
  />
);

/** A figure: the image is a picture (S4) with its alt text as a visible caption. */
export const MdImg = ({ className, alt, ...props }: El<'img'>) => (
  <figure className="my-6 overflow-hidden rounded-site border border-site-border bg-site-bg-subtle">
    <img className={cn('h-auto w-full', className)} alt={alt} loading="lazy" {...props} />
    {alt && <figcaption className="t-meta border-t border-site-border px-3 py-2">{alt}</figcaption>}
  </figure>
);

/**
 * Inline code only. A fenced block arrives as `<pre><code class="language-x">`,
 * and `AnimatedPre` already paints that surface — a second chip inside it would
 * double the border and background, so the fenced case renders bare.
 */
export const MarkdownCode = ({ className, ...props }: El<'code'>) => {
  if (className?.includes('language-')) return <code className={className} {...props} />;
  return (
    <code
      className={cn(
        // eslint-disable-next-line local/no-arbitrary-type-size -- relative em: inline code scales with the surrounding prose, which no absolute step can express
        'rounded-site-sm bg-site-bg-subtle px-1.5 py-0.5 font-mono text-[0.9em] text-site-text',
        className,
      )}
      {...props}
    />
  );
};

export const MarkdownA = ({ className, href, children, ...props }: El<'a'>) => {
  // Anything that isn't same-document or site-relative leaves the site.
  const external = !!href && !/^(\/|#)/.test(href);
  return (
    <a
      href={href}
      className={cn('font-medium text-site-text underline underline-offset-4', className)}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      {...props}
    >
      {children}
    </a>
  );
};

export const MarkdownStrong = ({ className, ...props }: El<'strong'>) => (
  <strong className={cn('font-bold text-site-text', className)} {...props} />
);

export const MarkdownEm = ({ className, ...props }: El<'em'>) => (
  <em className={cn('text-site-text italic', className)} {...props} />
);

/*
 * No `table`/`th`/`td` entries on purpose: `remark-gfm` is not installed, so
 * react-markdown parses CommonMark only and a GFM pipe table never becomes a
 * `<table>` — it arrives as a paragraph of literal `|` text. Handlers for those
 * tags would be unreachable code. Rendering tables in a post means adding the
 * `remark-gfm` plugin first (which would also switch on strikethrough,
 * autolinks and task lists).
 */

/**
 * The whole map, ready to hand to `<ReactMarkdown components={…}>`. Every
 * consumer imports this rather than re-assembling the object, so the published
 * article and the admin preview of it can never drift apart.
 */
export const markdownComponents = {
  h1: MdH1,
  h2: MdH2,
  h3: MdH3,
  h4: MdH4,
  p: MdP,
  ul: MdUl,
  ol: MdOl,
  li: MdLi,
  blockquote: MdBlockquote,
  img: MdImg,
  hr: MdHr,
  pre: MdPre,
  code: MarkdownCode,
  a: MarkdownA,
  strong: MarkdownStrong,
  em: MarkdownEm,
};
