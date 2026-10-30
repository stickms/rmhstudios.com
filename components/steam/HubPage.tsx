'use client';

import { useState } from 'react';
import { Link, useRouter } from '@tanstack/react-router';
import { toast } from 'sonner';
import { Lock, MessageSquare, Pin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MAX_POST, MAX_THREAD_BODY, MAX_TITLE } from '@/lib/games/hub-rules';
import type { HubData } from '@/lib/games/hub-types';
import { formatPlaytime } from '@/lib/games/format-playtime';
import { timeAgoShort } from '@/lib/utils';
import { CommunityNav } from './CommunityNav';
import { GroupRow, Stars } from './CommunityHome';
import { PersonAvatar } from './SteamPeople';
import { TitleArt } from './TitleArt';
import { hubErrorText } from './hub-errors';

function NewThread({ gameId }: { gameId: string }) {
  const { t } = useTranslation('games-hub');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch('/api/games/hub/thread', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ gameId, title, body }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (res.ok && data.id) {
        await router.navigate({
          to: '/games/hub/$gameId/t/$threadId',
          params: { gameId, threadId: data.id },
        });
      } else {
        toast.error(hubErrorText(data.error, t));
      }
    } catch {
      toast.error(hubErrorText(undefined, t));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="stm-web-pad">
        <button type="button" className="stm-btn stm-btn-blue" onClick={() => setOpen(true)}>
          {t('steam-hub-new', { defaultValue: 'Start a discussion' })}
        </button>
      </div>
    );
  }
  return (
    <form className="stm-hub-form" onSubmit={(e) => void submit(e)}>
      <label>
        <span className="stm-subhead">{t('steam-hub-title', { defaultValue: 'Title' })}</span>
        <input
          className="stm-input"
          value={title}
          maxLength={MAX_TITLE}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
      </label>
      <label>
        <span className="stm-subhead">{t('steam-hub-body', { defaultValue: 'Text' })}</span>
        <textarea
          className="stm-textarea"
          rows={5}
          value={body}
          maxLength={MAX_THREAD_BODY}
          onChange={(e) => setBody(e.target.value)}
          required
        />
      </label>
      <div className="stm-write-actions">
        <button type="submit" className="stm-btn stm-btn-blue" disabled={busy}>
          {t('steam-hub-post', { defaultValue: 'Post' })}
        </button>
        <button type="button" className="stm-btn" onClick={() => setOpen(false)}>
          {t('steam-market-cancel', { defaultValue: 'Cancel' })}
        </button>
      </div>
    </form>
  );
}

/** A title's Community Hub: discussions, with guides, reviews, players and the market beside them. */
export function HubPage({ data }: { data: HubData }) {
  const { t } = useTranslation('games-hub');
  return (
    <div className="stm-web">
      <CommunityNav />
      <header className="stm-group-head">
        <TitleArt build={{ title: data.title, thumbnailUrl: data.image, hue: data.hue }} width={72} height={108} className="stm-art-lg" />
        <div className="stm-group-title">
          <h1>{data.title}</h1>
          <p className="stm-muted">{t('steam-hub-heading', { defaultValue: 'Community Hub' })}</p>
        </div>
        <Link to="/games/$gameId" params={{ gameId: data.gameId }} className="stm-btn">
          {t('steam-hub-library', { defaultValue: 'Library page' })}
        </Link>
      </header>

      <div className="stm-web-cols">
        <div>
          <section className="stm-web-card" aria-labelledby="stm-hub-disc">
            <h2 id="stm-hub-disc" className="stm-web-head">
              {t('steam-hub-discussions', { defaultValue: 'Discussions' })}
            </h2>
            {data.signedIn ? (
              <NewThread gameId={data.gameId} />
            ) : (
              <p className="stm-web-pad stm-muted">
                <a className="stm-link" href={`/login?callbackURL=${encodeURIComponent(`/games/hub/${data.gameId}`)}`}>
                  {t('steam-sign-in', { defaultValue: 'Sign in' })}
                </a>{' '}
                {t('steam-hub-signin-hint', { defaultValue: 'to start or join a discussion.' })}
              </p>
            )}
            {data.threads.length === 0 ? (
              <p className="stm-web-pad stm-muted">
                {t('steam-hub-empty', { defaultValue: 'No discussions yet. Be the first.' })}
              </p>
            ) : (
              <ul className="stm-thread-list">
                {data.threads.map((th) => (
                  <li key={th.id}>
                    <Link
                      to="/games/hub/$gameId/t/$threadId"
                      params={{ gameId: data.gameId, threadId: th.id }}
                      className="stm-thread"
                    >
                      <PersonAvatar src={th.author.image} name={th.author.name} />
                      <span className="stm-thread-body">
                        <span className="stm-thread-title">
                          {th.pinned ? <Pin aria-label={t('steam-hub-pinned', { defaultValue: 'Pinned' })} size={14} /> : null}
                          {th.locked ? <Lock aria-label={t('steam-hub-locked', { defaultValue: 'Locked' })} size={14} /> : null}
                          {th.title}
                        </span>
                        <span className="stm-person-sub">{th.snippet}</span>
                        <span className="stm-person-sub">
                          {th.author.name} · {timeAgoShort(th.lastPostAt)}
                        </span>
                      </span>
                      <span className="stm-thread-count" title={t('steam-hub-replies', { defaultValue: 'Replies' })}>
                        <MessageSquare aria-hidden size={14} />
                        {th.replyCount}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {data.page > 1 || data.hasMore ? (
              <nav className="stm-pager" aria-label={t('steam-hub-pages', { defaultValue: 'Pages' })}>
                {data.page > 1 ? (
                  <Link to="/games/hub/$gameId" params={{ gameId: data.gameId }} search={{ page: data.page - 1 }} className="stm-link">
                    {t('steam-hub-newer', { defaultValue: 'Newer' })}
                  </Link>
                ) : <span />}
                {data.hasMore ? (
                  <Link to="/games/hub/$gameId" params={{ gameId: data.gameId }} search={{ page: data.page + 1 }} className="stm-link">
                    {t('steam-hub-older', { defaultValue: 'Older' })}
                  </Link>
                ) : null}
              </nav>
            ) : null}
          </section>
        </div>

        <aside>
          <section className="stm-web-card" aria-labelledby="stm-hub-guides">
            <h2 id="stm-hub-guides" className="stm-web-head">
              {t('steam-hub-guides', { defaultValue: 'Player guides' })}
            </h2>
            {data.guides.length === 0 ? (
              <p className="stm-web-pad stm-muted">{t('steam-hub-no-guides', { defaultValue: 'No guides yet.' })}</p>
            ) : (
              <ul className="stm-people">
                {data.guides.map((g) => (
                  <li key={g.id}>
                    <Link to="/games/$gameId/guides/$guideId" params={{ gameId: data.gameId, guideId: g.id }} className="stm-person">
                      <span className="stm-person-body">
                        <span className="stm-person-name">{g.title}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="stm-web-card" aria-labelledby="stm-hub-reviews">
            <h2 id="stm-hub-reviews" className="stm-web-head">
              {t('steam-latest-reviews', { defaultValue: 'Latest reviews' })}
            </h2>
            {data.reviews.length === 0 ? (
              <p className="stm-web-pad stm-muted">{t('steam-hub-no-reviews', { defaultValue: 'No reviews yet.' })}</p>
            ) : (
              <ul className="stm-people">
                {data.reviews.map((r) => (
                  <li key={r.id} className="stm-person">
                    <span className="stm-person-body">
                      <span className="stm-person-name">
                        <Stars value={r.stars} />
                      </span>
                      {r.body ? <span className="stm-person-sub">{r.body.slice(0, 90)}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {data.topPlayers.length > 0 ? (
            <section className="stm-web-card" aria-labelledby="stm-hub-top">
              <h2 id="stm-hub-top" className="stm-web-head">
                {t('steam-most-played-by', { defaultValue: 'Most played by' })}
              </h2>
              <ul className="stm-people">
                {data.topPlayers.slice(0, 5).map((p) => (
                  <li key={p.userId}>
                    <Link to="/games/profile/$id" params={{ id: p.handle ?? p.userId }} className="stm-person">
                      <PersonAvatar src={p.image} name={p.name ?? '?'} />
                      <span className="stm-person-body">
                        <span className="stm-person-name">{p.name ?? p.handle}</span>
                        <span className="stm-person-sub">
                          {t('steam-on-record', { defaultValue: '{{time}} on record', time: formatPlaytime(p.totalSeconds) })}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {data.communities.length > 0 ? (
            <section className="stm-web-card" aria-labelledby="stm-hub-groups">
              <h2 id="stm-hub-groups" className="stm-web-head">
                {t('steam-groups', { defaultValue: 'Groups' })}
              </h2>
              <ul className="stm-people">
                {data.communities.map((c) => (
                  <GroupRow key={c.slug} group={c} />
                ))}
              </ul>
            </section>
          ) : null}

          <section className="stm-web-card" aria-labelledby="stm-hub-market">
            <h2 id="stm-hub-market" className="stm-web-head">
              {t('steam-market', { defaultValue: 'Community Market' })}
            </h2>
            <p className="stm-web-pad">
              <Link to="/games/market" className="stm-link">
                {t('steam-hub-cards-on-sale', { defaultValue: 'Cards for sale: {{n}}', n: data.cardsOnSale })}
              </Link>
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

export { MAX_POST };
