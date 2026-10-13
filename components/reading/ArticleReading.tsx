'use client';

/**
 * The lazy half of the article enhancements: highlights, notes, popular-passage
 * underlines and the highlights list. Mounted by ArticleBody after hydration on
 * idle; reads the single per-document bundle ArticleBody already requested.
 */

import { type RefObject } from 'react';
import type { ReadingDocKind } from '@/lib/reading/schema';
import { useDocBundle } from '@/lib/reading/client';
import { HighlightsSection } from './HighlightsSection';
import { NO_HIGHLIGHTS, NO_POPULAR, useHighlightKit } from './useHighlightKit';

export default function ArticleReading({
  kind,
  docKey,
  containerRef,
}: {
  kind: ReadingDocKind;
  docKey: string;
  containerRef: RefObject<HTMLElement | null>;
}) {
  const { data } = useDocBundle(kind, docKey, true);
  const kit = useHighlightKit({
    kind,
    docKey,
    unit: '',
    rootRef: containerRef,
    mine: data?.mine ?? NO_HIGHLIGHTS,
    popular: data?.popular ?? NO_POPULAR,
    signedIn: data?.signedIn ?? false,
    textKey: `${data?.glossary.length ?? 0}`,
  });

  return (
    <>
      {kit.view}
      {data ? (
        <HighlightsSection
          kind={kind}
          docKey={docKey}
          unit=""
          kit={kit}
          publicNotes={data.publicNotes}
          signedIn={data.signedIn}
        />
      ) : null}
    </>
  );
}
