/**
 * The two small pieces every highlight list shares for s10-01: `useMakeCard` (opens the lazy "Make a card" dialog
 * and hands back the element to mount) and `CardDecksLine` ("In <deck>" under a highlight that has cards). The dialog
 * is a separate chunk, fetched the first time a member asks for a card.
 */

import { Fragment, lazy, Suspense, useCallback, useRef, useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { CardSource } from './MakeCardDialog';

const MakeCardDialog = lazy(() => import('./MakeCardDialog'));

export function useMakeCard(onMade?: () => void): {
  /** Open the dialog for these highlights; pass the control that was pressed so focus returns to it. */
  start: (sources: readonly CardSource[], from?: HTMLElement | null) => void;
  view: ReactNode;
} {
  const [state, setState] = useState<{ sources: readonly CardSource[]; key: number } | null>(null);
  const [open, setOpen] = useState(false);
  const returnRef = useRef<HTMLElement | null>(null);

  const start = useCallback((sources: readonly CardSource[], from?: HTMLElement | null) => {
    returnRef.current = from ?? null;
    setState((prev) => ({ sources, key: (prev?.key ?? 0) + 1 }));
    setOpen(true);
  }, []);

  const view = state ? (
    <Suspense fallback={null}>
      <MakeCardDialog
        key={state.key}
        open={open}
        onOpenChange={setOpen}
        sources={state.sources}
        returnFocusRef={returnRef}
        {...(onMade ? { onMade } : {})}
      />
    </Suspense>
  ) : null;

  return { start, view };
}

/** "In <deck>, <deck>": the member's decks that hold a card made from this highlight. Nothing when there are none. */
export function CardDecksLine({ decks }: { decks: readonly { id: string; title: string }[] }) {
  const { t } = useTranslation('highlight-cards');
  if (decks.length === 0) return null;
  return (
    <span>
      {t('in-deck', { defaultValue: 'In' })}{' '}
      {decks.map((d, i) => (
        <Fragment key={d.id}>
          {i > 0 ? ', ' : null}
          <Link to="/study/$deckId" params={{ deckId: d.id }} className="underline">
            <bdi>{d.title}</bdi>
          </Link>
        </Fragment>
      ))}
    </span>
  );
}
