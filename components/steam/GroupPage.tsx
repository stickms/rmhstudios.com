'use client';

import { Link } from '@tanstack/react-router';
import { Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SteamGroup } from '@/lib/games/community-types';
import { CommunityNav } from './CommunityNav';
import { PersonAvatar } from './SteamPeople';
import { TitleArt } from './TitleArt';

/** A Steam group page: the group's header, what it is about, and who is in it. */
export function GroupPage({ group }: { group: SteamGroup }) {
  const { t } = useTranslation('games-hub');
  const joined = new Date(group.createdAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  return (
    <div className="stm-web">
      <CommunityNav />
      <header className="stm-group-head">
        <span className="stm-group-badge" aria-hidden>
          {group.icon ?? <Users />}
        </span>
        <div className="stm-group-title">
          <h1>{group.name}</h1>
          <p className="stm-muted">
            {t('steam-members-n', { defaultValue: 'Members: {{n}}', n: group.memberCount })}
            {' · '}
            {t('steam-group-founded', { defaultValue: 'Founded {{date}}', date: joined })}
          </p>
        </div>
        <Link to="/c/$slug" params={{ slug: group.slug }} className="stm-btn stm-btn-blue">
          {group.joined
            ? t('steam-group-open', { defaultValue: 'Open group' })
            : t('steam-group-join', { defaultValue: 'Join group' })}
        </Link>
      </header>

      <div className="stm-web-cols">
        <div>
          <section className="stm-web-card" aria-labelledby="stm-group-about">
            <h2 id="stm-group-about" className="stm-web-head">
              {t('steam-group-about', { defaultValue: 'About this group' })}
            </h2>
            <p className="stm-web-pad">
              {group.description ?? t('steam-group-no-desc', { defaultValue: 'This group has no description yet.' })}
            </p>
          </section>

          <section className="stm-web-card" aria-labelledby="stm-group-members">
            <h2 id="stm-group-members" className="stm-web-head">
              {t('steam-group-members', { defaultValue: 'Members' })}
            </h2>
            {group.members.length === 0 ? (
              <p className="stm-muted stm-web-pad">
                {t('steam-group-no-members', { defaultValue: 'No members to show yet.' })}
              </p>
            ) : null}
            <ul className="stm-people stm-people-grid">
              {group.members.map((m) => (
                <li key={m.userId}>
                  <Link
                    to="/games/profile/$id"
                    params={{ id: m.handle ?? m.userId }}
                    className="stm-person"
                  >
                    <PersonAvatar src={m.image} name={m.name} />
                    <span className="stm-person-body">
                      <span className="stm-person-name">{m.name}</span>
                      {m.role !== 'MEMBER' ? (
                        <span className="stm-person-sub">
                          {m.role === 'ADMIN'
                            ? t('steam-role-admin', { defaultValue: 'Owner' })
                            : t('steam-role-mod', { defaultValue: 'Moderator' })}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside>
          {group.game ? (
            <section className="stm-web-card" aria-labelledby="stm-group-game">
              <h2 id="stm-group-game" className="stm-web-head">
                {t('steam-group-game', { defaultValue: 'Official group for' })}
              </h2>
              <Link to="/games/$gameId" params={{ gameId: group.game.id }} className="stm-person">
                <TitleArt build={group.game} width={48} height={72} className="stm-art-sm" />
                <span className="stm-person-name">{group.game.title}</span>
              </Link>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
