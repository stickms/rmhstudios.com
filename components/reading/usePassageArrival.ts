/**
 * Arrival at a linked passage (`?p=`). Once the unit's text is on screen the reader resolves the anchor against it
 * with `resolveAnchor`, scrolls the passage into view once (no smooth scrolling: R5), marks it with a static
 * highlight, and moves focus to a "Linked passage" landmark — the block that holds the passage. If the text no longer
 * holds the passage it opens normally and reports `missing`, which the reader says in one line.
 *
 * Runs after the text is available and again only when the text under the root is replaced (`textKey`); no observer,
 * no polling, no frame loop. The decoded text is only ever a search string against the document.
 */

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { decodePassage, passageMarkEnd } from '@/lib/library/passage-link';
import { resolveAnchor } from '@/lib/library/text-anchor';
import { buildTextIndex, clearHighlight, offsetsToRange, paintHighlight } from '@/lib/reading/dom-text';

export const PASSAGE_HIGHLIGHT = 'rf-passage';
const LANDMARK = 'p,li,blockquote,h1,h2,h3,h4,h5,h6,td,th,dt,dd,pre,figcaption';

export type PassageArrival = 'idle' | 'found' | 'missing';

export function usePassageArrival(opts: {
  /** The raw `?p=` value, if any. */
  code: string | undefined;
  /** '' for an article; the unit key ("p12", "c3") the shown text belongs to for a book. */
  unit: string;
  /** The text under `rootRef` is the unit's text and is on screen. */
  ready: boolean;
  /** Changes when the text under the root is replaced. */
  textKey: string;
  rootRef: RefObject<HTMLElement | null>;
  /** The translated "Linked passage". */
  label: string;
}): PassageArrival {
  const { code, unit, ready, textKey, rootRef, label } = opts;
  const decoded = useMemo(() => (code ? decodePassage(code) : null), [code]);
  const [state, setState] = useState<PassageArrival>('idle');
  const arrived = useRef<string | null>(null);

  useEffect(() => {
    if (!code) return;
    if (!decoded) {
      setState('missing');
      return;
    }
    // A book link names its own page or chapter; the reader opens it first. Another unit stays quiet.
    if (decoded.unit !== unit) {
      if (arrived.current !== code && unit === '') setState('missing');
      return;
    }
    const root = rootRef.current;
    if (!ready || !root) return;
    const index = buildTextIndex(root);
    if (index.text.length === 0) return;
    const hit = resolveAnchor(index.text, decoded.anchor);
    const end = hit ? passageMarkEnd(decoded.anchor, hit.start, index.text.length) : 0;
    const range = hit ? offsetsToRange(index, hit.start, end) : null;
    if (!range) {
      clearHighlight(PASSAGE_HIGHLIGHT);
      setState('missing');
      return;
    }
    paintHighlight(PASSAGE_HIGHLIGHT, [range]);
    const block =
      range.startContainer.parentElement?.closest<HTMLElement>(LANDMARK) ?? range.startContainer.parentElement;
    if (block) {
      block.setAttribute('role', 'region');
      block.setAttribute('aria-label', label);
      block.setAttribute('data-passage-landmark', '');
      if (!block.hasAttribute('tabindex')) block.setAttribute('tabindex', '-1');
      if (arrived.current !== code) {
        // Once per link: scroll, then focus without a second scroll.
        block.scrollIntoView({ block: 'center', behavior: 'auto' });
        block.focus({ preventScroll: true });
      }
    }
    arrived.current = code;
    setState('found');
    return () => {
      clearHighlight(PASSAGE_HIGHLIGHT);
      if (block) {
        block.removeAttribute('role');
        block.removeAttribute('aria-label');
        block.removeAttribute('data-passage-landmark');
        if (block.getAttribute('tabindex') === '-1') block.removeAttribute('tabindex');
      }
    };
  }, [code, decoded, unit, ready, textKey, rootRef, label]);

  return code ? state : 'idle';
}
