/**
 * CardsGate — loads the learner's profile and remembered cards (`useLearnStore.load`, `loadCards`)
 * and shows the page only once both are there. The Insights and Today pages read the same stored
 * cards Practice does, so they share its three outcomes: still loading (a fixed-height skeleton
 * the caller draws), signed out (a sign-in link that comes back here) and "couldn't load" with a
 * retry. Nothing here writes.
 */
import { useEffect, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useLearnStore } from '@/lib/rmhmusic/learn/store';
import { PRIMARY_BUTTON } from './buttons';

export type CardsGateState = 'loading' | 'ready' | 'signed-out' | 'failed';

/** Where the learner's data stands, and the effect that starts loading it. */
export function useCardsGate(): CardsGateState {
  const status = useLearnStore((s) => s.status);
  const error = useLearnStore((s) => s.error);
  const cardsStatus = useLearnStore((s) => s.cardsStatus);
  useEffect(() => {
    const store = useLearnStore.getState();
    void store.load();
    void store.loadCards();
  }, []);
  if ((status === 'error' && error === 'unauthorized') || cardsStatus === 'unauthorized') return 'signed-out';
  if (status === 'error' || cardsStatus === 'load_failed') return 'failed';
  return status === 'ready' && cardsStatus === 'ready' ? 'ready' : 'loading';
}

/** The message for a gate that is not ready (signed out or failed); null while loading or ready. */
export function CardsGateNotice({ state, returnTo }: { state: CardsGateState; returnTo: string }): ReactNode {
  const { t } = useTranslation('c-rmhmusic');
  if (state === 'signed-out') {
    return (
      <div role="alert" className="rmm-sheet space-y-3 p-5">
        <p className="text-app-text">
          {t('error-signed-out', {
            defaultValue: 'Your session ended. Sign in again to continue.',
          })}
        </p>
        <Link to="/login" search={{ callbackURL: returnTo }} className={PRIMARY_BUTTON}>
          {t('sign-in', {
            defaultValue: 'Sign in',
          })}
        </Link>
      </div>
    );
  }
  if (state === 'failed') {
    return (
      <div role="alert" className="rmm-sheet space-y-3 p-5">
        <p className="text-app-text">
          {t('practice-load-failed', {
            defaultValue: "Couldn't load your practice cards.",
          })}
        </p>
        <button
          type="button"
          onClick={() => {
            const store = useLearnStore.getState();
            void store.load();
            void store.loadCards();
          }}
          className={PRIMARY_BUTTON}
        >
          {t('retry', {
            defaultValue: 'Try again',
          })}
        </button>
      </div>
    );
  }
  return null;
}
