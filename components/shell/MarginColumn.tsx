import { lazy, useId, type FormEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ArrivalSuspense } from '@/components/ui/arrive';
import { Input } from '@/components/ui/input';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useMarginSlotRef } from './margin-slot';

/** The lists are their own chunk, fetched only where the margin is displayed. */
const MarginLists = lazy(() => import('./MarginLists'));

/**
 * The margin column (Steel L6): a search field, then at most two short lists under `t-label` headings, then whatever
 * the page portals in (`ContextRail`). Nothing here is a card; the only pictures are the avatars in "Who to follow".
 *
 * The search field is a real GET form to `/explore`, so it works with scripting off; with scripting it navigates in
 * place. `/` still opens the command palette (KeyboardShortcuts).
 */
export function MarginColumn() {
  const { t } = useTranslation('feed');
  const navigate = useNavigate();
  const fieldId = useId();
  const setSlot = useMarginSlotRef();
  // The margin is displayed from 1280px (site-shell.css); below it the lists would be fetched for nobody.
  const displayed = useMediaQuery('(min-width: 1280px)');

  const submit = (event: FormEvent<HTMLFormElement>) => {
    const q = String(new FormData(event.currentTarget).get('q') ?? '').trim();
    event.preventDefault();
    void navigate({ to: '/explore', search: { q, tab: 'top' } });
  };

  return (
    <aside
      className="site-margin"
      aria-label={t('shell-margin-label', { defaultValue: 'Search and what is new' })}
    >
      <form role="search" action="/explore" method="get" className="site-margin__search" onSubmit={submit}>
        <label htmlFor={fieldId} className="sr-only">
          {t('search', { defaultValue: 'Search' })}
        </label>
        <Input
          id={fieldId}
          type="search"
          name="q"
          autoComplete="off"
          aria-keyshortcuts="/"
          placeholder={t('search-site', { defaultValue: 'Search RMH Studios' })}
        />
      </form>
      {displayed && (
        <ArrivalSuspense>
          <MarginLists />
        </ArrivalSuspense>
      )}
      <div ref={setSlot} className="site-margin__page" />
    </aside>
  );
}
