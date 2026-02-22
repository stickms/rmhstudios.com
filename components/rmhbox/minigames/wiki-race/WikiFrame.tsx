/**
 * WikiFrame — Renders sanitized Wikipedia article HTML with clickable
 * internal links.
 *
 * The server sends sanitized HTML via `WR_ARTICLE_CONTENT`. This
 * component renders it into a scrollable frame. Internal wiki links
 * carry `data-wiki-target` attributes (set by the server sanitizer);
 * clicks on those links emit `NAVIGATE` via the parent's callback.
 *
 * External links, images, scripts, and iframes are stripped server-side.
 *
 * Props:
 *   html: string — Sanitized article HTML from the server
 *   currentTitle: string — Title of the currently displayed article
 *   isLoading: boolean — Whether a new article is being fetched
 *   disabled: boolean — True when player has finished
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
  const containerRef = useRef<HTMLDivElement>(null);

  /** Handle clicks inside the article HTML */
  const handleClick = useCallback(
    (e: MouseEvent) => {
      if (disabled) return;

      const target = (e.target as HTMLElement).closest('a[data-wiki-target]') as HTMLAnchorElement | null;
      if (!target) return;

      e.preventDefault();
      e.stopPropagation();

      const wikiTarget = target.getAttribute('data-wiki-target');
      if (wikiTarget) {
        onNavigate(wikiTarget);
      }
    },
    [disabled, onNavigate],
  );

  // Attach click listener to the container
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener('click', handleClick);
    return () => container.removeEventListener('click', handleClick);
  }, [handleClick]);

  // Scroll to top on article change
  useEffect(() => {
    containerRef.current?.scrollTo(0, 0);
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

      {/* Article content */}
      {html && (
        <div
          ref={containerRef}
          className={`wiki-frame max-h-[50vh] overflow-y-auto px-4 py-3 text-sm leading-relaxed ${
            disabled ? 'pointer-events-none opacity-60' : ''
          } ${isLoading ? 'opacity-40' : ''}`}
          dangerouslySetInnerHTML={{ __html: html }}
          style={{
            // Override wiki HTML styling for dark mode
            color: 'var(--rmhbox-text)',
          }}
        />
      )}

      {/* Wiki-frame link styles */}
      <style jsx>{`
        .wiki-frame a[data-wiki-target] {
          color: var(--rmhbox-accent);
          text-decoration: underline;
          text-decoration-style: dotted;
          cursor: pointer;
          transition: color 0.15s ease;
        }
        .wiki-frame a[data-wiki-target]:hover {
          color: white;
          background-color: var(--rmhbox-accent);
          border-radius: 2px;
          padding: 0 2px;
        }
        .wiki-frame h2, .wiki-frame h3, .wiki-frame h4 {
          font-weight: 700;
          margin-top: 1em;
          margin-bottom: 0.5em;
        }
        .wiki-frame p {
          margin-bottom: 0.5em;
        }
        .wiki-frame ul, .wiki-frame ol {
          padding-left: 1.5em;
          margin-bottom: 0.5em;
        }
      `}</style>
    </div>
  );
}
