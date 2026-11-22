/** "Fewest moves today": the day's three fewest-move public replays, each a row linking to its replay page. */
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiQuery } from '@/lib/contract/client';
import { replayBoardApi } from '@/lib/game/replay-library.contract';
import { useArrival } from '@/components/ui/arrive';
import { Spinner } from '@/components/ui/spinner';

export function FewestMovesToday({ seed }: { seed: number }) {
  const { t } = useTranslation('lights-out-replays');
  const query = useQuery({
    ...apiQuery(replayBoardApi, { query: { game: 'lights-out', seed } }),
    staleTime: 30_000,
  });
  const arrival = useArrival(!query.isPending);
  const items = query.data?.items ?? [];

  return (
    <section aria-labelledby="lights-out-fewest-h" className="mt-6">
      <h2 id="lights-out-fewest-h" className="t-heading">
        {t('fewest-moves-today', { defaultValue: 'Fewest moves today' })}
      </h2>
      {query.isPending ? (
        <div role="status" className="py-3">
          <Spinner size={16} label={t('fewest-loading', { defaultValue: 'Loading replays' })} />
        </div>
      ) : query.isError ? (
        <p role="alert" className="t-body py-3 text-site-text-muted">
          {t('fewest-error', { defaultValue: 'Could not load the replays.' })}
        </p>
      ) : items.length === 0 ? (
        <p className="t-body py-3 text-site-text-muted">
          {t('fewest-empty', { defaultValue: "No replays of today's puzzle yet" })}
        </p>
      ) : (
        <ul className={arrival}>
          {items.map((r) => {
            const author = r.author.name ?? r.author.handle ?? t('fewest-someone', { defaultValue: 'Someone' });
            const count = r.score ?? 0;
            return (
              <li key={r.id} className="border-b border-site-border">
                <Link
                  to="/replays/$id"
                  params={{ id: r.id }}
                  className="flex items-center justify-between gap-3 py-3"
                  aria-label={t('fewest-row-aria', {
                    defaultValue: 'Watch the replay by {{author}}',
                    author,
                  })}
                >
                  <bdi className="t-body" dir="auto">
                    {author}
                  </bdi>
                  <span className="t-meta">
                    {t('fewest-moves', {
                      defaultValue_one: '{{count}} move',
                      defaultValue: '{{count}} moves',
                      count,
                    })}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
