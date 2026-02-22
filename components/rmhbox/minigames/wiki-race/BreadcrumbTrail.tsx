/**
 * BreadcrumbTrail — Navigation breadcrumb for Wiki-Race.
 *
 * Displays the player's article path as a horizontal breadcrumb.
 * Clicking on a previous breadcrumb triggers `GO_BACK` to rewind the
 * path to that article. The current article is highlighted, and the
 * start/target articles have distinct styling.
 *
 * Props:
 *   path: string[]          — Ordered list of article titles visited
 *   startTitle: string      — Title of the start article
 *   targetTitle: string     — Title of the target article
 *   onGoBack: (title, pathIndex) => void
 *   disabled: boolean       — True when player has finished
 */
'use client';

import { useRef, useEffect } from 'react';
import { ChevronRight, MapPin, Target } from 'lucide-react';

interface BreadcrumbTrailProps {
  path: string[];
  startTitle: string;
  targetTitle: string;
  onGoBack: (title: string, pathIndex: number) => void;
  disabled: boolean;
}

export default function BreadcrumbTrail({
  path,
  startTitle,
  targetTitle,
  onGoBack,
  disabled,
}: BreadcrumbTrailProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll trail to the right on new entries
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [path.length]);

  if (path.length === 0) return null;

  const lastIndex = path.length - 1;

  return (
    <div
      ref={scrollRef}
      className="flex items-center gap-1 overflow-x-auto rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-surface) px-3 py-2 scrollbar-thin"
    >
      <span className="mr-1 text-xs font-medium text-(--rmhbox-text-muted) shrink-0">
        Path ({path.length}):
      </span>
      {path.map((title, idx) => {
        const isStart = title === startTitle;
        const isTarget = title === targetTitle;
        const isCurrent = idx === lastIndex;
        const isClickable = !disabled && !isCurrent;

        return (
          <span key={`${idx}-${title}`} className="flex items-center gap-1 shrink-0">
            {idx > 0 && (
              <ChevronRight size={10} className="text-(--rmhbox-text-muted)/50" />
            )}
            <button
              onClick={() => isClickable && onGoBack(title, idx)}
              disabled={!isClickable}
              className={`
                flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium transition-colors
                ${isCurrent
                  ? 'bg-(--rmhbox-accent)/20 text-(--rmhbox-accent) font-bold'
                  : isStart
                    ? 'text-green-400 hover:bg-green-500/10'
                    : isTarget
                      ? 'text-yellow-400 hover:bg-yellow-500/10'
                      : 'text-(--rmhbox-text-muted) hover:bg-(--rmhbox-surface-hover) hover:text-(--rmhbox-text)'
                }
                ${isClickable ? 'cursor-pointer' : 'cursor-default'}
              `}
              title={isClickable ? `Go back to "${title}"` : title}
            >
              {isStart && <MapPin size={10} />}
              {isTarget && <Target size={10} />}
              {title.length > 25 ? `${title.slice(0, 22)}…` : title}
            </button>
          </span>
        );
      })}
    </div>
  );
}
