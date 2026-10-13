'use client';

/**
 * The library reader's text view (L1, L6, L8, Y2 in the reader).
 *
 * The page-curl reader paints each page into a WebGL texture, so there is no
 * text to select there. This view shows the same book as selectable text, one
 * unit at a time (a PDF page, or an EPUB chapter), and runs the same highlight
 * kit the articles use. A scanned PDF page has no text layer; this view says so
 * instead of offering highlights it cannot anchor.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { buildGlossaryMatcher, findGlossaryMatches } from '@/lib/reading/glossary';
import { useDocBundle } from '@/lib/reading/client';
import { useReadingRuler } from '@/lib/reading/ruler';
import { textVersion } from '@/lib/reading/passages';
import type { GlossaryTermView } from '@/lib/reading/schema';
import { GlossaryContext, GlossaryTermLink } from './ArticleNotes';
import { HighlightsSection } from './HighlightsSection';
import ReadingRuler from './ReadingRuler';
import type { ReaderTextSource } from './ReaderReadingTools';
import { NO_HIGHLIGHTS, NO_NOTES, NO_POPULAR, useHighlightKit } from './useHighlightKit';

/** Fewer characters than this on a page means no usable text layer. */
const MIN_TEXT = 12;
const EMPTY: GlossaryTermView[] = [];

export default function ReaderTextView({
  book,
  source,
  onClose,
}: {
  book: { slug: string; title: string };
  source: ReaderTextSource;
  onClose: () => void;
}) {
  const { t } = useTranslation('f-reading');
  const [unit, setUnit] = useState(() => Math.max(1, Math.min(source.count, source.current)));
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [ruler, setRuler] = useReadingRuler();
  const bodyRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const loadRef = useRef(source.load);
  loadRef.current = source.load;
  const { data } = useDocBundle('library', book.slug, true);

  useEffect(() => {
    let alive = true;
    setText(null);
    setFailed(false);
    loadRef
      .current(unit)
      .then((value) => alive && setText(value))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [unit]);

  // The page-turn shortcut (←/→ on window) must not fire behind this view.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const stop = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') e.stopPropagation();
    };
    el.addEventListener('keydown', stop);
    return () => el.removeEventListener('keydown', stop);
  }, []);

  const unitKey = source.unitKey(unit);
  const glossary = data?.glossary ?? EMPTY;
  const glossaryMap = useMemo(() => new Map(glossary.map((g) => [g.id, g])), [glossary]);

  // Paragraphs, with each glossary term linked at its first occurrence in the unit.
  const paragraphs = useMemo(() => {
    if (!text) return [];
    const matcher = glossary.length ? buildGlossaryMatcher(glossary) : null;
    const seen = new Set<string>();
    return text.split(/\n{2,}/).map((para) => {
      const parts: Array<string | { id: string; label: string }> = [];
      let at = 0;
      for (const m of matcher ? findGlossaryMatches(para, matcher, seen) : []) {
        if (m.start > at) parts.push(para.slice(at, m.start));
        parts.push({ id: m.term.id, label: para.slice(m.start, m.end) });
        at = m.end;
      }
      parts.push(para.slice(at));
      return parts;
    });
  }, [text, glossary]);

  const kit = useHighlightKit({
    kind: 'library',
    docKey: book.slug,
    unit: unitKey,
    rootRef: bodyRef,
    mine: data?.mine ?? NO_HIGHLIGHTS,
    popular: data?.popular ?? NO_POPULAR,
    signedIn: data?.signedIn ?? false,
    textKey: `${unitKey}:${text ? textVersion(text) : ''}`,
  });

  const go = useCallback(
    (delta: number) => setUnit((u) => Math.max(1, Math.min(source.count, u + delta))),
    [source.count],
  );

  const unitName =
    source.unitLabel === 'page'
      ? t('unit-page', { defaultValue: 'Page' })
      : t('unit-chapter', { defaultValue: 'Chapter' });
  const noText = text !== null && text.replace(/\s/g, '').length < MIN_TEXT;

  return (
    <div
      ref={rootRef}
      className="rf-textview"
      role="region"
      aria-label={t('text-view-region', {
        title: book.title,
        defaultValue: 'Text view of {{title}}',
      })}
    >
      <div className="glass-chrome flex flex-wrap items-center gap-2 px-3 py-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          <ArrowLeft aria-hidden />
          {t('back-to-book', { defaultValue: 'Back to the book' })}
        </Button>
        <div className="ms-auto flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={unit <= 1}
            onClick={() => go(-1)}
            aria-label={t('prev-unit', { unit: unitName, defaultValue: 'Previous {{unit}}' })}
          >
            <ChevronLeft aria-hidden />
          </Button>
          <Select
            controlSize="sm"
            className="w-32"
            aria-label={t('go-to-unit', { unit: unitName, defaultValue: 'Go to {{unit}}' })}
            value={unit}
            onChange={(e) => setUnit(Number(e.target.value))}
          >
            {Array.from({ length: source.count }, (_, i) => (
              <option key={i} value={i + 1}>
                {unitName} {i + 1}
              </option>
            ))}
          </Select>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={unit >= source.count}
            onClick={() => go(1)}
            aria-label={t('next-unit', { unit: unitName, defaultValue: 'Next {{unit}}' })}
          >
            <ChevronRight aria-hidden />
          </Button>
        </div>
        <label className="flex items-center gap-2 text-sm text-site-text-muted">
          <Switch
            checked={ruler}
            onCheckedChange={setRuler}
            aria-label={t('ruler-label', { defaultValue: 'Reading ruler' })}
          />
          {t('ruler-label', { defaultValue: 'Reading ruler' })}
        </label>
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          className="h-full overflow-y-auto"
          tabIndex={0}
          aria-label={t('text-view-scroll', { defaultValue: 'Book text' })}
        >
          <GlossaryContext.Provider value={glossaryMap}>
            <div className="mx-auto max-w-2xl px-4 py-6">
              {text === null && !failed ? (
                <p role="status" className="flex items-center gap-2 text-site-text-muted">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  {t('loading-text', { defaultValue: 'Loading text…' })}
                </p>
              ) : null}
              {failed ? (
                <p role="alert" className="text-site-text-muted">
                  {t('text-failed', {
                    defaultValue: 'Could not read the text of this part of the book.',
                  })}
                </p>
              ) : null}
              {noText ? (
                <div className="glass-fill rounded-site p-4 text-site-text-muted" role="note">
                  <p className="font-semibold text-site-text">
                    {t('no-text-layer', { defaultValue: 'No selectable text here' })}
                  </p>
                  <p className="mt-1">
                    {t('no-text-layer-hint', {
                      defaultValue:
                        'This page is a scanned image with no text layer, so it cannot be highlighted or annotated. Pages that do have text can be.',
                    })}
                  </p>
                </div>
              ) : null}
              <div ref={bodyRef} className="rf-textview__body">
                {noText
                  ? null
                  : paragraphs.map((parts, i) => (
                      <p key={i}>
                        {parts.map((part, j) =>
                          typeof part === 'string' ? (
                            part
                          ) : (
                            <GlossaryTermLink key={j} id={part.id}>
                              {part.label}
                            </GlossaryTermLink>
                          ),
                        )}
                      </p>
                    ))}
              </div>
              {text !== null && !noText ? (
                <HighlightsSection
                  kind="library"
                  docKey={book.slug}
                  unit={unitKey}
                  kit={kit}
                  publicNotes={data?.publicNotes ?? NO_NOTES}
                  signedIn={data?.signedIn ?? false}
                />
              ) : null}
            </div>
          </GlossaryContext.Provider>
        </div>
        {ruler ? <ReadingRuler scope="contained" containerRef={bodyRef} /> : null}
      </div>
      {kit.view}
    </div>
  );
}
