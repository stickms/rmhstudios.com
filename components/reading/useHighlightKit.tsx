'use client';

/**
 * The shared highlight machinery (L1 + L8) behind article pages and the library
 * reader's text view. Given the element that holds the text, the member's
 * highlights and the popular passages, it:
 *  - indexes the element's text and re-anchors every highlight through
 *    `resolveAnchor` (position → unique match → best context → orphan),
 *  - paints them with the CSS Custom Highlight API (own highlights, notes, and
 *    the dotted "N readers" underline), re-doing so when the DOM changes,
 *  - turns a text selection into a floating Highlight / Add note toolbar,
 *  - opens the editor when an existing highlight is clicked.
 * It never reads the pointer position for layout; the toolbar is placed from the
 * selection's own rectangle.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Highlighter, StickyNote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { createAnchor, resolveAnchor, type TextAnchor } from '@/lib/library/text-anchor';
import {
  buildTextIndex,
  clearHighlight,
  offsetsToRange,
  paintHighlight,
  rangeToOffsets,
  supportsCustomHighlights,
  type TextIndex,
} from '@/lib/reading/dom-text';
import { MIN_READERS_TO_SHOW, passagesFor, textVersion } from '@/lib/reading/passages';
import { ApiError, useHighlightActions } from '@/lib/reading/client';
import type {
  HighlightView,
  PopularPassage,
  PublicNoteView,
  ReadingDocKind,
} from '@/lib/reading/schema';
import { HighlightEditor, type EditorState } from './HighlightEditor';

/** Stable empties, so a not-yet-loaded bundle does not hand the kit a new array every render. */
export const NO_HIGHLIGHTS: HighlightView[] = [];
export const NO_POPULAR: PopularPassage[] = [];
export const NO_NOTES: PublicNoteView[] = [];

export interface ResolvedHighlight {
  h: HighlightView;
  start: number;
  end: number;
}

interface KitOptions {
  kind: ReadingDocKind;
  docKey: string;
  /** '' for articles; "p12" / "c3" for a library unit. */
  unit: string;
  rootRef: RefObject<HTMLElement | null>;
  mine: HighlightView[];
  popular: PopularPassage[];
  signedIn: boolean;
  /** Changes whenever the text under rootRef is replaced (e.g. a new unit loads). */
  textKey?: string;
}

interface Sel {
  start: number;
  end: number;
  rect: { top: number; left: number; bottom: number };
}

const rafIdle = (fn: () => void) => window.setTimeout(fn, 120);

export function useHighlightKit(opts: KitOptions) {
  const { kind, docKey, unit, rootRef, mine, popular, signedIn, textKey } = opts;
  const { t } = useTranslation('f-reading');
  const actions = useHighlightActions(kind, docKey);
  const indexRef = useRef<TextIndex | null>(null);
  const [resolved, setResolved] = useState<ResolvedHighlight[]>([]);
  const [orphans, setOrphans] = useState<HighlightView[]>([]);
  const [popularShown, setPopularShown] = useState(0);
  const [sel, setSel] = useState<Sel | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const resolvedRef = useRef<ResolvedHighlight[]>([]);
  resolvedRef.current = resolved;

  const unitMine = useMemo(() => mine.filter((h) => h.unit === unit), [mine, unit]);

  const repaint = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const index = buildTextIndex(root);
    indexRef.current = index;
    if (index.text.length === 0) {
      setResolved([]);
      setOrphans([]);
      return;
    }
    const ok: ResolvedHighlight[] = [];
    const lost: HighlightView[] = [];
    for (const h of unitMine) {
      const anchor: TextAnchor = {
        exact: h.exact,
        prefix: h.prefix,
        suffix: h.suffix,
        start: h.start,
        end: h.end,
      };
      const hit = resolveAnchor(index.text, anchor);
      if (hit) ok.push({ h, start: hit.start, end: hit.end });
      else lost.push(h);
    }
    const plain: Range[] = [];
    const noted: Range[] = [];
    for (const r of ok) {
      const range = offsetsToRange(index, r.start, r.end);
      if (range) (r.h.note ? noted : plain).push(range);
    }
    const pop: Range[] = [];
    for (const p of popular) {
      if (p.unit !== unit || p.readers < MIN_READERS_TO_SHOW) continue;
      const hit = resolveAnchor(index.text, {
        exact: p.sample,
        prefix: '',
        suffix: '',
        start: p.start,
        end: p.start + p.sample.length,
      });
      const range = hit ? offsetsToRange(index, hit.start, hit.end) : null;
      if (range) pop.push(range);
    }
    paintHighlight('rf-mine', plain);
    paintHighlight('rf-note', noted);
    paintHighlight('rf-popular', pop);
    setResolved(ok);
    setOrphans(lost);
    setPopularShown(pop.length);
  }, [rootRef, unitMine, popular, unit]);

  // Paint now, and again whenever the text under the root changes.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    repaint();
    let timer: number | undefined;
    const mo = new MutationObserver(() => {
      window.clearTimeout(timer);
      timer = rafIdle(repaint);
    });
    mo.observe(root, { childList: true, subtree: true, characterData: true });
    return () => {
      mo.disconnect();
      window.clearTimeout(timer);
    };
  }, [repaint, rootRef, textKey]);

  useEffect(
    () => () => {
      clearHighlight('rf-mine');
      clearHighlight('rf-note');
      clearHighlight('rf-popular');
      clearHighlight('rf-flash');
    },
    [],
  );

  // Selection → floating toolbar.
  useEffect(() => {
    let timer: number | undefined;
    const read = () => {
      const root = rootRef.current;
      const s = document.getSelection();
      if (
        !root ||
        !s ||
        s.rangeCount === 0 ||
        s.isCollapsed ||
        !root.contains(s.anchorNode) ||
        !root.contains(s.focusNode)
      ) {
        setSel(null);
        return;
      }
      const index = indexRef.current ?? buildTextIndex(root);
      indexRef.current = index;
      const range = s.getRangeAt(0);
      const off = rangeToOffsets(index, range);
      if (!off) {
        setSel(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      setSel({ ...off, rect: { top: rect.top, left: rect.left, bottom: rect.bottom } });
    };
    const onChange = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(read, 140);
    };
    document.addEventListener('selectionchange', onChange);
    return () => {
      document.removeEventListener('selectionchange', onChange);
      window.clearTimeout(timer);
    };
  }, [rootRef]);

  const failure = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) {
        toast.info(
          t('sign-in-to-highlight', { defaultValue: 'Sign in to save highlights and notes.' }),
        );
      } else {
        toast.error(
          err instanceof ApiError
            ? err.message
            : t('highlight-failed', { defaultValue: 'Could not save that. Try again.' }),
        );
      }
    },
    [t],
  );

  const begin = useCallback(
    (withNote: boolean) => {
      const index = indexRef.current;
      if (!sel || !index) return;
      if (!signedIn) {
        toast.info(
          t('sign-in-to-highlight', { defaultValue: 'Sign in to save highlights and notes.' }),
        );
        return;
      }
      const anchor = createAnchor(index.text, sel.start, sel.end);
      if (!anchor) return;
      if (anchor.exact.length > 2000) {
        toast.error(
          t('selection-too-long', {
            defaultValue: 'That selection is too long to highlight. Select a shorter passage.',
          }),
        );
        return;
      }
      const input = {
        unit,
        ...anchor,
        version: textVersion(index.text),
        isPublic: false,
        passages: [] as ReturnType<typeof passagesFor>,
      };
      if (withNote) {
        setEditor({ mode: 'create', quote: anchor.exact, anchor: input });
        document.getSelection()?.removeAllRanges();
        setSel(null);
        return;
      }
      void actions
        .create(input)
        .then(() => toast.success(t('highlight-saved', { defaultValue: 'Highlight saved.' })))
        .catch(failure);
      document.getSelection()?.removeAllRanges();
      setSel(null);
    },
    [sel, signedIn, unit, actions, failure, t],
  );

  // Clicking an existing highlight opens it for editing.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onClick = (e: MouseEvent) => {
      if (!document.getSelection()?.isCollapsed) return;
      if ((e.target as HTMLElement).closest('a,button,[data-rf-skip]')) return;
      const d = document as Document & {
        caretPositionFromPoint?: (
          x: number,
          y: number,
        ) => { offsetNode: Node; offset: number } | null;
        caretRangeFromPoint?: (x: number, y: number) => Range | null;
      };
      const pos = d.caretPositionFromPoint?.(e.clientX, e.clientY);
      const node = pos?.offsetNode ?? d.caretRangeFromPoint?.(e.clientX, e.clientY)?.startContainer;
      const off = pos?.offset ?? d.caretRangeFromPoint?.(e.clientX, e.clientY)?.startOffset;
      const index = indexRef.current;
      if (!node || off === undefined || !index) return;
      const entry = index.byNode.get(node);
      if (!entry) return;
      const at = entry.start + off;
      const hit = resolvedRef.current.find((r) => at >= r.start && at <= r.end);
      if (hit)
        setEditor({
          mode: 'edit',
          quote: hit.h.exact,
          highlight: hit.h,
          start: hit.start,
          end: hit.end,
        });
    };
    root.addEventListener('click', onClick);
    return () => root.removeEventListener('click', onClick);
  }, [rootRef]);

  const scrollTo = useCallback((start: number, end: number) => {
    const index = indexRef.current;
    if (!index) return;
    const range = offsetsToRange(index, start, end);
    if (!range) return;
    const target = range.startContainer.parentElement;
    target?.scrollIntoView({ block: 'center', behavior: 'auto' });
    paintHighlight('rf-flash', [range]);
    window.setTimeout(() => clearHighlight('rf-flash'), 1400);
  }, []);

  const editSaved = useCallback(
    (r: ResolvedHighlight) =>
      setEditor({ mode: 'edit', quote: r.h.exact, highlight: r.h, start: r.start, end: r.end }),
    [],
  );

  const view = (
    <>
      {sel ? (
        <div
          className="rf-seltool glass-overlay"
          data-rf-skip=""
          role="toolbar"
          aria-label={t('selection-toolbar', { defaultValue: 'Selection actions' })}
          style={{
            top: sel.rect.top > 64 ? sel.rect.top - 52 : sel.rect.bottom + 8,
            left: Math.max(8, Math.min(sel.rect.left, document.documentElement.clientWidth - 220)),
          }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <Button type="button" variant="ghost" size="sm" onClick={() => begin(false)}>
            <Highlighter aria-hidden />
            {t('highlight', { defaultValue: 'Highlight' })}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => begin(true)}>
            <StickyNote aria-hidden />
            {t('add-note', { defaultValue: 'Add note' })}
          </Button>
        </div>
      ) : null}
      <HighlightEditor
        state={editor}
        onClose={() => setEditor(null)}
        indexText={() => indexRef.current?.text ?? ''}
        actions={actions}
        onError={failure}
      />
    </>
  );

  return {
    view,
    resolved,
    orphans,
    popularShown,
    hasSelection: sel !== null,
    beginFromSelection: begin,
    scrollTo,
    editSaved,
    paints: supportsCustomHighlights(),
    getText: () => indexRef.current?.text ?? '',
  };
}
