'use client';

import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Users } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import type { SteamGroup } from '@/lib/games/community-types';
import type { SteamAnnouncement, SteamGroupPost } from '@/lib/games/group-posts';
import { CommunityNav } from './CommunityNav';
import { PersonAvatar } from './SteamPeople';
import { TitleArt } from './TitleArt';

/** A Steam group page: the group's header, what it is about, and who is in it. */
export function GroupPage({
  group,
  announcements,
  posts,
}: {
  group: SteamGroup;
  announcements: SteamAnnouncement[];
  posts: SteamGroupPost[];
}) {
  const { t } = useTranslation('games-hub');
  const [isMember, setIsMember] = useState(group.joined);
  const [memberCount, setMemberCount] = useState(group.memberCount);
  const [busy, setBusy] = useState(false);

  const toggleJoin = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/communities/${group.slug}/join`, {
        method: 'POST',
        credentials: 'include',
      });
      const body = (await res.json().catch(() => ({}))) as { joined?: boolean; error?: string };
      if (res.ok && typeof body.joined === 'boolean') {
        if (body.joined !== isMember) setMemberCount((n) => n + (body.joined ? 1 : -1));
        setIsMember(body.joined);
      } else {
        toast.error(body.error ?? t('steam-group-join-failed', { defaultValue: 'Could not update membership.' }));
      }
    } finally {
      setBusy(false);
    }
  };

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
            {t('steam-members-n', { defaultValue: 'Members: {{n}}', n: memberCount })}
            {' · '}
            {t('steam-group-founded', { defaultValue: 'Founded {{date}}', date: joined })}
          </p>
        </div>
        {group.signedIn ? (
          <button
            type="button"
            className={`stm-btn ${isMember ? 'stm-btn-ghost' : 'stm-btn-blue'}`}
            disabled={busy}
            onClick={() => void toggleJoin()}
          >
            {isMember
              ? t('steam-group-leave', { defaultValue: 'Leave group' })
              : t('steam-group-join', { defaultValue: 'Join group' })}
          </button>
        ) : (
          <a className="stm-btn stm-btn-blue" href={`/login?callbackURL=${encodeURIComponent(`/games/groups/${group.slug}`)}`}>
            {t('steam-group-signin', { defaultValue: 'Sign in to join' })}
          </a>
        )}
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

          {announcements.length > 0 ? (
            <section className="stm-web-card" aria-labelledby="stm-group-news">
              <h2 id="stm-group-news" className="stm-web-head">
                {t('steam-group-announcements', { defaultValue: 'Announcements' })}
              </h2>
              <ul className="stm-posts">
                {announcements.map((a) => (
                  <li key={a.id} className="stm-post">
                    <p className="stm-post-text">{a.body}</p>
                    <p className="stm-muted stm-post-meta">
                      {a.author.name ?? a.author.handle ?? ''} · {new Date(a.createdAt).toLocaleDateString()}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="stm-web-card" aria-labelledby="stm-group-posts">
            <h2 id="stm-group-posts" className="stm-web-head">
              {t('steam-group-discussion', { defaultValue: 'Recent discussion' })}
            </h2>
            {posts.length === 0 ? (
              <p className="stm-muted stm-web-pad">
                {t('steam-group-no-posts', { defaultValue: 'No posts yet.' })}
              </p>
            ) : (
              <ul className="stm-posts">
                {posts.map((p) => (
                  <li key={p.id} className="stm-post">
                    <Link
                      to="/games/profile/$id"
                      params={{ id: p.author.handle ?? p.author.id }}
                      className="stm-person"
                    >
                      <PersonAvatar src={p.author.image} name={p.author.name ?? p.author.handle ?? '?'} />
                      <span className="stm-person-body">
                        <span className="stm-person-name">{p.author.name ?? p.author.handle}</span>
                        <span className="stm-person-sub">{new Date(p.createdAt).toLocaleString()}</span>
                      </span>
                    </Link>
                    <p className="stm-post-text">{p.content}</p>
                    <p className="stm-muted stm-post-meta">
                      {t('steam-group-post-counts', {
                        defaultValue: 'Likes: {{likes}} · Replies: {{replies}}',
                        likes: p.likeCount,
                        replies: p.commentCount,
                      })}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <p className="stm-web-pad">
              <Link to="/c/$slug" params={{ slug: group.slug }} className="stm-link">
                {t('steam-group-main-site', { defaultValue: 'Post or moderate on the main site' })}
              </Link>
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
