import { Suspense, use, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/contract/client';
import { getAssistsApi } from '@/lib/game/assist.contract';
import { startAssistRunApi } from '@/lib/game/assist-run.contract';
import { hasAnyAssist, NO_ASSISTS, type AssistProfile } from '@/lib/game/assist';

/**
 * The assist layer for game ISLANDS (`lib/__tests__/islands.test.ts`): the same
 * game-side half as `assist-run.tsx`, with no React Query and no router, because
 * an island document has neither provider. Calls go through the plain contract
 * client; the start-screen read is a cached promise read with `use()`.
 */

/** Ask the server for this run's profile. Any failure is the ranked profile: the server still unranks on submit. */
export function useAssistRun(gameId: string, signedIn: boolean) {
  return useCallback(async (): Promise<AssistProfile> => {
    if (!signedIn) return NO_ASSISTS;
    try {
      return (
        await api(startAssistRunApi, {
          params: {
            gameId,
          },
        })
      ).profile;
    } catch {
      return NO_ASSISTS;
    }
  }, [gameId, signedIn]);
}

let assistsOn: Promise<boolean> | null = null;
function loadAssistsOn(): Promise<boolean> {
  assistsOn ??= api(getAssistsApi)
    .then((r) => hasAnyAssist(r.assists))
    .catch(() => false);
  return assistsOn;
}

function StartNoticeLine({ className }: { className?: string }) {
  const { t } = useTranslation('game-assists');
  if (!use(loadAssistsOn())) return null;
  return (
    <p className={className} role="status" data-testid="assist-start-notice">
      {t('start-notice', {
        defaultValue: 'Assists on: this run will not be ranked.',
      })}{' '}
      <a href="/settings/game-assists" className="underline">
        {t('start-notice-link', {
          defaultValue: 'Change assists',
        })}
      </a>
    </p>
  );
}

/** One line on the start screen when assists are on, with the way to the settings page. */
export function AssistStartNotice({ signedIn, className }: { signedIn: boolean; className?: string }) {
  if (!signedIn) return null;
  return (
    <Suspense fallback={null}>
      <StartNoticeLine className={className} />
    </Suspense>
  );
}

/** The `ranked` flag in a score endpoint's body; null when the body has none (a guest, a failed save). */
export function parseRanked(body: unknown): boolean | null {
  if (!body || typeof body !== 'object') return null;
  const r = (
    body as {
      ranked?: unknown;
    }
  ).ranked;
  return typeof r === 'boolean' ? r : null;
}

/** One line in the results when the server says the run was not ranked. */
export function NotRankedNote({ ranked, className }: { ranked: boolean | null; className?: string }) {
  const { t } = useTranslation('game-assists');
  if (ranked !== false) return null;
  return (
    <p className={className} role="status" data-testid="assist-not-ranked">
      {t('not-ranked', {
        defaultValue: 'Not ranked: assists were on.',
      })}
    </p>
  );
}
