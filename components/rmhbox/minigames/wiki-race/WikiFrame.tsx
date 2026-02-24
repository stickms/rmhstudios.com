/**
 * WikiFrame — Renders sanitized Wikipedia article HTML with clickable
 * internal links.
 *
 * The server sends sanitized HTML via `WR_ARTICLE_CONTENT`. This
 * component renders it into a scrollable frame. Internal wiki links
 * carry `data-wiki-target` attributes (set by the server sanitizer);
 * clicks on those links emit `NAVIGATE` via the parent's callback.
 *
 * The inner content div is marked `inert` so that browser find-in-page
 * (Ctrl+F) cannot match text inside the article — players must navigate
 * by reading, not searching.  Scrolling is handled by the non-inert
 * wrapper, and link clicks are detected with `elementFromPoint`.
 *
 * External links, images, scripts, and iframes are stripped server-side.
 *
 * Props:
 *   html: string — Sanitized article HTML from the server
 *   currentTitle: string — Title of the currently displayed article
 *   isLoading: boolean — Whether a new article is being fetched
 *   disabled: boolean — True when player has finished (links disabled,
 *                        scrolling still allowed)
 *   onNavigate: (targetTitle: string) => void
 */
'use client';

import { useRef, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

interface WikiFrameProps {
  html: string;
  currentTitle: string;
  isLoading: boolean;
  disabled: boolean;
  onNavigate: (targetTitle: string) => void;
}

export default function WikiFrame({
  html,
  currentTitle,
  isLoading,
  disabled,
  onNavigate,
}: WikiFrameProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  /**
   * Handle clicks on wiki links.
   *
   * Because the content div is `inert`, pointer events pass through to
   * the scrollable wrapper.  We temporarily lift `inert`, query
   * `elementFromPoint` to find the link under the cursor, then restore it.
   */
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (disabled) return;

      const contentEl = contentRef.current;
      if (!contentEl) return;

      // Lift inert, hit-test, restore
      contentEl.removeAttribute('inert');
      const el = document.elementFromPoint(e.clientX, e.clientY);
      contentEl.setAttribute('inert', '');

      const link = (el as HTMLElement | null)?.closest('a[data-wiki-target]') as HTMLAnchorElement | null;
      if (!link) return;

      e.preventDefault();
      e.stopPropagation();

      const wikiTarget = link.getAttribute('data-wiki-target');
      if (wikiTarget) {
        onNavigate(wikiTarget);
      }
    },
    [disabled, onNavigate],
  );

  // Scroll to top on article change
  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
  }, [currentTitle]);

  return (
    <div className="relative rounded-xl border border-(--rmhbox-border) bg-white/5 overflow-hidden">
      {/* Title bar */}
      <div className="flex items-center justify-between border-b border-(--rmhbox-border) bg-(--rmhbox-surface) px-4 py-2">
        <h3 className="text-sm font-bold truncate">{currentTitle || 'Loading…'}</h3>
        {isLoading && (
          <Loader2 size={14} className="animate-spin text-(--rmhbox-accent)" />
        )}
      </div>

      {/* Loading overlay */}
      {isLoading && !html && (
        <div className="flex h-64 items-center justify-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          >
            <Loader2 size={24} className="text-(--rmhbox-accent)" />
          </motion.div>
        </div>
      )}

      {/* Article content — scrollable wrapper is NOT inert so scroll+click work */}
      {html && (
        <div
          ref={scrollRef}
          onClick={handleClick}
          className={`max-h-[50vh] overflow-y-auto px-4 py-3 text-sm leading-relaxed ${
            isLoading ? 'opacity-40' : ''
          } ${!disabled ? 'wiki-frame-clickable' : ''}`}
        >
          <div
            ref={contentRef}
            className={`wiki-frame ${disabled ? 'wiki-frame-disabled' : ''}`}
            inert
            dangerouslySetInnerHTML={{ __html: html }}
            style={{ color: 'var(--rmhbox-text)' }}
          />
        </div>
      )}

      {/* Wiki-frame styles — must be global to apply to dangerouslySetInnerHTML content */}
      <style>{`
        .wiki-frame a[data-wiki-target] {
          color: #3366cc;
          text-decoration: underline;
          cursor: pointer;
          transition: color 0.15s ease;
        }
        .wiki-frame a[data-wiki-target]:hover {
          color: #5577dd;
        }
        .wiki-frame a[data-wiki-target]:visited {
          color: #795cb2;
        }
        .wiki-frame.wiki-frame-disabled {
          opacity: 0.7;
        }
        .wiki-frame.wiki-frame-disabled a[data-wiki-target] {
          color: inherit;
          text-decoration: none;
          cursor: default;
        }
        .wiki-frame .stripped-link {
          color: inherit;
        }
        .wiki-frame h2 {
          font-size: 1.25rem;
          font-weight: 700;
          margin-top: 1em;
          margin-bottom: 0.5em;
          padding-bottom: 0.25em;
          border-bottom: 1px solid var(--rmhbox-border);
        }
        .wiki-frame h3 {
          font-size: 1.1rem;
          font-weight: 700;
          margin-top: 1em;
          margin-bottom: 0.5em;
        }
        .wiki-frame h4 {
          font-weight: 700;
          margin-top: 0.75em;
          margin-bottom: 0.4em;
        }
        .wiki-frame p {
          margin-bottom: 0.5em;
        }
        .wiki-frame ul, .wiki-frame ol {
          padding-left: 1.5em;
          margin-bottom: 0.5em;
        }
        .wiki-frame li {
          margin-bottom: 0.15em;
        }
        .wiki-frame table {
          border-collapse: collapse;
          margin-bottom: 0.75em;
          font-size: 0.8125rem;
        }
        .wiki-frame th,
        .wiki-frame td {
          border: 1px solid var(--rmhbox-border);
          padding: 0.35em 0.65em;
          text-align: left;
          vertical-align: top;
        }
        .wiki-frame th {
          background-color: var(--rmhbox-surface);
          font-weight: 600;
        }
        .wiki-frame tr:nth-child(even) td {
          background-color: rgba(255, 255, 255, 0.03);
        }
        .wiki-frame caption {
          caption-side: top;
          font-weight: 600;
          font-size: 0.875rem;
          margin-bottom: 0.25em;
          text-align: left;
        }
        .wiki-frame figure {
          margin: 0.5em 0;
        }
        .wiki-frame figcaption {
          font-size: 0.75rem;
          color: var(--rmhbox-text-muted);
          margin-top: 0.25em;
        }
        .wiki-frame img {
          max-width: 200px;
          height: auto;
        }
        .wiki-frame sup {
          font-size: 0.75em;
          vertical-align: super;
        }
        .wiki-frame sub {
          font-size: 0.75em;
          vertical-align: sub;
        }
        /* The inert attribute suppresses pointer-events on child elements,
           which prevents cursor: pointer from working on wiki links.
           Override on the scrollable wrapper level so users see the pointer
           when hovering links — click handling still uses elementFromPoint. */
        .wiki-frame-clickable {
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
