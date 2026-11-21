/**
 * The "Replays" section of a replayable game's library page: the top public replays of the game's current version,
 * best score first. The page's loader supplies the first answer (rendered on the server); the query keeps it fresh.
 * Styled with the library page's own section classes, like its reviews and guides.
 */
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiQuery } from '@/lib/contract/client';
import { replayBoardApi } from '@/lib/game/replay-library.contract';
import type { BoardReplay } from '@/lib/game/replay-library';
import { formatDurationMs } from '@/lib/core/format';

export function ReplayBoard({ gameId, initial }: { gameId: string; initial: BoardReplay[] }) {
  const { t, i18n } = useTranslation('replay-library');
  const query = useQuery({
    ...apiQuery(replayBoardApi, { query: { game: gameId } }),
    initialData: { items: initial },
    staleTime: 60_000,
  });
  const items = query.data.items;
  const number = new Intl.NumberFormat(i18n.language);
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' });

  return (
    <section id="replays" className="stm-card" aria-labelledby="stm-replays-h">
      <h2 id="stm-replays-h" className="stm-card-head">
        {t('board-title', { defaultValue: 'Replays' })}
      </h2>
      {items.length === 0 ? (
        <p className="stm-muted stm-card-note">{t('board-empty', { defaultValue: 'No public replays yet' })}</p>
      ) : (
        <ul className="stm-guides">
          {items.map((r) => {
            const author = r.author.name ?? r.author.handle ?? t('someone', { defaultValue: 'Someone' });
            const score = r.score == null ? t('unscored', { defaultValue: 'Unscored' }) : number.format(r.score);
            return (
              <li key={r.id}>
                <Link
                  to="/replays/$id"
                  params={{ id: r.id }}
                  className="stm-guide"
                  aria-label={t('board-row-aria', {
                    defaultValue: 'Watch replay by {{author}}, score {{score}}',
                    author,
                    score,
                  })}
                >
                  <span className="stm-person-body">
                    <span className="stm-person-name">
                      {score} · {author}
                    </span>
                    <span className="stm-person-sub">
                      {formatDurationMs(r.durationMs)} · {date.format(new Date(r.createdAt))}
                    </span>
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
