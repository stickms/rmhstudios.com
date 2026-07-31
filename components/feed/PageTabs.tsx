'use client';

/**
 * PageTabs — where a page's tab strip sits, and what sits under it.
 *
 * `LiquidTabs` already guarantees the strip itself looks the same everywhere
 * (one sheet, equal segments, full track — see its docblock). What it cannot
 * own is the *placement*: every tabbed page re-typed its own wrapper, and they
 * disagreed. Measured at 1600px, on a page column 800px wide:
 *
 *   Inbox, Communities, Store, Explore   strip 766px at x=384
 *   Create (`.cstudio-tabs` gutters)     strip 710px at x=412
 *   Library (inside the explorer card)   strip 694px at x=420
 *
 * Three different strip widths on six pages, plus two different sizes (`sm` on
 * Inbox and Explore, default on the rest) and `iconOnly` on two — so Create
 * showed "User B…" and "AI Pers…" where its neighbours showed labels. This
 * component is the one answer: same gutters, same size, labels always.
 *
 * ## The search slot
 *
 * Search goes **below** the strip, never above it. Explore and the library both
 * had it above — Explore inside a sticky capsule that read as the page header,
 * the library inside a card that also swallowed the tabs — so on those two
 * pages the first thing under the title was a field, and on the other four it
 * was the tabs. Tabs first: they say what you are looking at, and the field
 * filters within it. Pass `search` and it lands in a matching gutter directly
 * under the strip.
 *
 * A page whose search belongs to one tab's panel (the Inbox searches messages,
 * not notifications) renders its own field inside that panel instead — same
 * `SearchField`, same position, just owned by the panel that filters.
 */

import type { ReactNode } from 'react';
import { LiquidTabs, type LiquidTab } from '@/components/ui/liquid-tabs';

interface PageTabsProps {
  tabs: LiquidTab[];
  value: string;
  onChange: (id: string) => void;
  /**
   * ARIA panel wiring — with it, tabs get `${idBase}-tab-${id}` /
   * `aria-controls="${idBase}-panel-${id}"` and the page renders matching
   * `role="tabpanel"` elements. Pass it unless the tabs switch whole routes.
   */
  idBase?: string;
  /** Accessible name for the tablist (already translated). */
  'aria-label'?: string;
  /** Optional search field, rendered in a matching gutter below the strip. */
  search?: ReactNode;
}

/** The shared gutter. One number, so no page can drift off the column edge. */
const GUTTER = 'px-2 md:px-3';

export function PageTabs({
  tabs,
  value,
  onChange,
  idBase,
  'aria-label': ariaLabel,
  search,
}: PageTabsProps) {
  return (
    <>
      <div className={`mt-3 ${search ? 'mb-2' : 'mb-3'} ${GUTTER}`}>
        <LiquidTabs
          tabs={tabs}
          value={value}
          onChange={onChange}
          idBase={idBase}
          aria-label={ariaLabel}
        />
      </div>
      {search && <div className={`mb-3 ${GUTTER}`}>{search}</div>}
    </>
  );
}
