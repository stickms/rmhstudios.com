'use client';

import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Lock, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CommunityNav } from './CommunityNav';
import { filterCommunities, type SteamCommunity } from './communities-view';

function Row({ community }: { community: SteamCommunity }) {
  const { t } = useTranslation('games-hub');
  const body = (
    <>
      <span className="stm-group-icon" aria-hidden>
        {community.icon ?? <Users size={16} />}
      </span>
      <span className="stm-person-body">
        <span className="stm-person-name">{community.name}</span>
        <span className="stm-person-sub">
          {t('steam-members-n', { defaultValue: 'Members: {{n}}', n: community.memberCount })}
          {community.isPrivate ? ` · ${t('steam-group-private', { defaultValue: 'Private' })}` : ''}
        </span>
      </span>
      {community.locked ? <Lock size={14} aria-hidden /> : null}
    </>
  );
  return (
    <li>
      {community.locked ? (
        <span className="stm-person">{body}</span>
      ) : (
        <Link to="/games/groups/$slug" params={{ slug: community.slug }} className="stm-person">
          {body}
        </Link>
      )}
    </li>
  );
}

/** Every community, drawn as Steam draws its group directory. */
export function CommunitiesPage({ communities }: { communities: SteamCommunity[] }) {
  const { t } = useTranslation('games-hub');
  const [q, setQ] = useState('');
  const shown = filterCommunities(communities, q);
  return (
    <div className="stm-web">
      <CommunityNav />
      <div className="stm-shop">
        <h1 className="stm-web-title">{t('steam-communities-title', { defaultValue: 'Communities' })}</h1>
        <input
          type="search"
          className="stm-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label={t('steam-communities-search', { defaultValue: 'Search communities' })}
          placeholder={t('steam-communities-search', { defaultValue: 'Search communities' })}
        />
        <section className="stm-web-card" aria-label={t('steam-communities-title', { defaultValue: 'Communities' })}>
          {shown.length === 0 ? (
            <p className="stm-muted stm-web-pad">
              {t('steam-communities-empty', { defaultValue: 'No communities match.' })}
            </p>
          ) : (
            <ul className="stm-people">
              {shown.map((c) => (
                <Row key={c.slug} community={c} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
