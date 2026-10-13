'use client';

/**
 * The shared article body for /blog/$slug and /news/$slug.
 *
 * Renders the Markdown exactly as the routes did, plus:
 *  - L2: `[^1]` footnotes → margin sidenotes where there is room, popovers where
 *    there is not, and a notes list underneath as the always-there fallback;
 *  - L6: known lore terms link (first occurrence per page) to a glossary popover;
 *  - L1/L8/Y2: a lazily loaded enhancer (highlights, popular passages, notes,
 *    reading ruler) that mounts after hydration on idle.
 *
 * First paint is unchanged: footnotes render in the server HTML, and everything
 * else waits for idle. The route modules that import this file are part of the
 * entry chunk, so it imports only small modules; the enhancer is `lazy()`.
 */

import { lazy, Suspense, useEffect, useMemo, useRef, type ComponentProps } from 'react';
import ReactMarkdown from 'react-markdown';
import { markdownComponents, MarkdownA } from '@/components/blog/MDXAnimations';
import { useIdleReady } from '@/hooks/useIdleReady';
import { extractFootnotes, FOOTNOTE_HREF } from '@/lib/reading/footnotes';
import { buildGlossaryMatcher, rehypeGlossary } from '@/lib/reading/glossary';
import { useDocBundle } from '@/lib/reading/client';
import { useReadingRuler } from '@/lib/reading/ruler';
import type { GlossaryTermView, ReadingDocKind } from '@/lib/reading/schema';
import { ReadingToolbar } from './ReadingToolbar';
import { FootnoteList, FootnoteRef, GlossaryContext, GlossaryTermLink } from './ArticleNotes';
import './reading.css';

const ArticleReading = lazy(() => import('./ArticleReading'));
const ReadingRuler = lazy(() => import('./ReadingRuler'));

const EMPTY: GlossaryTermView[] = [];

export function ArticleBody({
  kind,
  slug,
  content,
}: {
  kind: Exclude<ReadingDocKind, 'library'>;
  slug: string;
  content: string;
}) {
  const idle = useIdleReady();
  const ref = useRef<HTMLDivElement>(null);
  const [ruler] = useReadingRuler();
  const { body, notes } = useMemo(() => extractFootnotes(content), [content]);
  const bundle = useDocBundle(kind, slug, idle);

  const glossary = bundle.data?.glossary ?? EMPTY;
  const glossaryMap = useMemo(() => new Map(glossary.map((g) => [g.id, g])), [glossary]);
  const rehypePlugins = useMemo(
    () => (glossary.length ? [rehypeGlossary(buildGlossaryMatcher(glossary))] : []),
    [glossary],
  );

  const components = useMemo(
    () => ({
      ...markdownComponents,
      a: (props: ComponentProps<'a'>) => {
        const m = props.href ? FOOTNOTE_HREF.exec(props.href) : null;
        const note = m ? notes[Number(m[1]) - 1] : undefined;
        if (note) return <FootnoteRef note={note} occurrence={Number(m![2])} />;
        return <MarkdownA {...props} />;
      },
      span: (props: ComponentProps<'span'> & { 'data-glossary'?: string }) => {
        const id = props['data-glossary'];
        if (id) return <GlossaryTermLink id={id}>{props.children}</GlossaryTermLink>;
        return <span {...props} />;
      },
    }),
    [notes],
  );

  // Sidenotes need free space between the column and the edge of its container.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (notes.length === 0) {
      el.dataset.sidenotes = 'off';
      return;
    }
    const check = () => {
      const edge =
        el.closest('main')?.getBoundingClientRect().right ?? document.documentElement.clientWidth;
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const rtl = getComputedStyle(el).direction === 'rtl';
      const room = rtl
        ? el.getBoundingClientRect().left - (el.closest('main')?.getBoundingClientRect().left ?? 0)
        : edge - el.getBoundingClientRect().right;
      el.dataset.sidenotes = room >= 16 * rem ? 'on' : 'off';
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [notes.length]);

  return (
    <GlossaryContext.Provider value={glossaryMap}>
      <ReadingToolbar />
      <div
        ref={ref}
        className="rf-article max-w-none break-words"
        data-rf-doc={`${kind}:${slug}`}
        data-sidenotes="off"
      >
        <ReactMarkdown components={components} rehypePlugins={rehypePlugins}>
          {body}
        </ReactMarkdown>
        <FootnoteList notes={notes} />
      </div>
      {idle ? (
        <Suspense fallback={null}>
          <ArticleReading kind={kind} docKey={slug} containerRef={ref} />
        </Suspense>
      ) : null}
      {ruler ? (
        <Suspense fallback={null}>
          <ReadingRuler scope="page" containerRef={ref} />
        </Suspense>
      ) : null}
    </GlossaryContext.Provider>
  );
}
