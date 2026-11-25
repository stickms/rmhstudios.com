import { BookOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { GuideSummary } from '@/lib/games/reviews';
import { RemovedByModerator, ReportItemButton } from './ReportItem';

/** Player-written guides for a title, listed as Steam's Guides tab does. */
export function SteamGuides({
  gameId,
  guides,
  signedIn,
}: {
  gameId: string;
  guides: GuideSummary[];
  signedIn: boolean;
}) {
  const { t } = useTranslation('games-hub');
  return (
    <section id="guides" className="stm-card" aria-labelledby="stm-guides-h">
      <h2 id="stm-guides-h" className="stm-card-head">
        {t('guides', { defaultValue: 'Player guides' })}
        {signedIn ? (
          <a className="stm-btn stm-card-action" href={`/games/${gameId}/guides/new`}>
            {t('write-guide', { defaultValue: 'Write a guide' })}
          </a>
        ) : null}
      </h2>
      {guides.length === 0 ? (
        <p className="stm-muted stm-card-note">
          {t('no-guides-hint', { defaultValue: 'Guides written by players will appear here.' })}
        </p>
      ) : (
        <ul className="stm-guides">
          {guides.map((g) => (
            <li key={g.id}>
              <a href={`/games/${gameId}/guides/${g.id}`} className="stm-guide">
                <BookOpen aria-hidden />
                <span className="stm-person-body">
                  <span className="stm-person-name" dir="auto">
                    {g.title}
                    {!g.published ? (
                      <span className="stm-muted"> ({t('draft', { defaultValue: 'draft' })})</span>
                    ) : null}
                  </span>
                  <bdi className="stm-person-sub">{g.author.name ?? g.author.handle}</bdi>
                </span>
              </a>
              {g.removed ? (
                <RemovedByModerator />
              ) : (
                // A draft is private to its author, so only a published guide by someone else is reportable.
                <ReportItemButton
                  entityType="game-guide"
                  entityId={g.id}
                  signedIn={signedIn}
                  isOwn={!!g.isMine || !g.published}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
