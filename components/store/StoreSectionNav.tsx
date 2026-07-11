'use client';

/**
 * Sticky section switcher for the combined /store page. Membership leads the
 * page, but the coin shop lived below the fold where new visitors missed it —
 * this pins a two-segment control to the top that (a) advertises both sections
 * at first paint, (b) scroll-spies whichever section is in view, and (c)
 * smooth-scrolls to a section on click. Purely navigational (it scrolls, it
 * doesn't swap content), so segments carry `aria-current`, not tab semantics.
 */

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export interface StoreSection {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

// Nearest scrollable ancestor — on mobile the page lives inside a custom
// `overflow-y-auto` container (MobileSidebarShell), not the document, so a plain
// `scrollIntoView` can target the wrong scroller. Mirrors the helper in
// MembershipPanel.
function getScrollParent(node: HTMLElement): HTMLElement | null {
  let el = node.parentElement;
  while (el) {
    const oy = getComputedStyle(el).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight) return el;
    el = el.parentElement;
  }
  return null;
}

function scrollToAnchor(id: string, offset: number) {
  const target = document.getElementById(id);
  if (!target) return;
  const scroller = getScrollParent(target);
  if (scroller) {
    const top =
      target.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top +
      scroller.scrollTop -
      offset;
    scroller.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  } else {
    const top = target.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }
}

/** Approx height of this sticky bar; sections offset their scroll target by it. */
const NAV_OFFSET = 56;

export function StoreSectionNav({ sections }: { sections: StoreSection[] }) {
  const [active, setActive] = useState(sections[0]?.id);

  // Scroll-spy: highlight the section occupying the top band of the viewport.
  // Root is the viewport (null), which works whether the window or the mobile
  // custom container is doing the scrolling.
  useEffect(() => {
    const els = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null);
    if (els.length === 0) return;

    const io = new IntersectionObserver(
      (entries) => {
        const inView = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (inView[0]) setActive(inView[0].target.id);
      },
      { rootMargin: '-15% 0px -70% 0px', threshold: 0 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [sections]);

  return (
    <nav
      aria-label="Store sections"
      className="sticky top-0 z-20 border-b border-site-border bg-site-bg/85 backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-md items-center gap-1 p-2">
        {sections.map((s) => {
          const isActive = active === s.id;
          return (
            <button
              key={s.id}
              type="button"
              aria-current={isActive ? 'true' : undefined}
              onClick={() => {
                setActive(s.id);
                scrollToAnchor(s.id, NAV_OFFSET);
              }}
              className={cn(
                'inline-flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-site-accent/40',
                isActive
                  ? 'bg-site-accent text-site-accent-fg'
                  : 'text-site-text-muted hover:bg-site-surface-hover hover:text-site-text',
              )}
            >
              {s.icon}
              {s.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
