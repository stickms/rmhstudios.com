'use client';

import { BookOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { GuideSummary } from '@/lib/games/reviews';

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
                  <span className="stm-person-name">
                    {g.title}
                    {!g.published ? (
                      <span className="stm-muted"> ({t('draft', { defaultValue: 'draft' })})</span>
                    ) : null}
                  </span>
                  <span className="stm-person-sub">{g.author.name ?? g.author.handle}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
