'use client';

import { useState } from 'react';
import { Link, useRouter } from '@tanstack/react-router';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { MAX_POST } from '@/lib/games/hub-rules';
import type { PersonRef } from '@/lib/games/community-types';
import type { ThreadPage as ThreadPageData } from '@/lib/games/hub-types';
import { timeAgoShort } from '@/lib/utils';
import { CommunityNav } from './CommunityNav';
import { EmotePicker } from './EmotePicker';
import { PersonAvatar } from './SteamPeople';
import { PostText } from './PostText';
import { hubErrorText } from './hub-errors';

async function post(path: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true };
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: data.error };
  } catch {
    return { ok: false };
  }
}

function Author({ person, when }: { person: PersonRef; when: string }) {
  return (
    <div className="stm-post-author">
      <Link to="/games/profile/$id" params={{ id: person.handle ?? person.userId }} className="stm-person">
        <PersonAvatar src={person.image} name={person.name} />
        <span className="stm-person-body">
          <span className="stm-person-name">{person.name}</span>
          <span className="stm-person-sub">{timeAgoShort(when)}</span>
        </span>
      </Link>
    </div>
  );
}

/** One discussion: the opening post, replies, a reply form, and moderation for admins. */
export function ThreadPage({ data }: { data: ThreadPageData }) {
  const { t } = useTranslation('games-hub');
  const router = useRouter();
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const th = data.thread;

  async function run(path: string, body: unknown, done?: string, after?: () => Promise<void>) {
    setBusy(true);
    const r = await post(path, body);
    setBusy(false);
    if (!r.ok) {
      toast.error(hubErrorText(r.error, t));
      return;
    }
    if (done) toast.success(done);
    if (after) await after();
    else await router.invalidate();
  }

  return (
    <div className="stm-web">
      <CommunityNav />
      <div className="stm-web-single">
        <p>
          <Link to="/games/hub/$gameId" params={{ gameId: data.gameId }} className="stm-link">
            {t('steam-hub-back', { defaultValue: 'Back to {{title}} discussions', title: data.gameTitle })}
          </Link>
        </p>
        <h1 className="stm-web-title">{th.title}</h1>

        <article className="stm-web-card stm-post">
          <Author person={th.author} when={th.createdAt} />
          <div className="stm-post-main">
            <PostText className="stm-post-text" text={th.body} ownedTitles={data.authorEmotes[th.author.userId] ?? []} />
            <div className="stm-post-tools">
              {th.canDelete ? (
                <button
                  type="button"
                  className="stm-btn"
                  disabled={busy}
                  onClick={() =>
                    void run('/api/games/hub/delete', { kind: 'thread', id: th.id }, t('steam-hub-deleted', { defaultValue: 'Deleted.' }), () =>
                      router.navigate({ to: '/games/hub/$gameId', params: { gameId: data.gameId } }),
                    )
                  }
                >
                  {t('steam-hub-delete', { defaultValue: 'Delete' })}
                </button>
              ) : null}
              {data.isAdmin ? (
                <>
                  <button
                    type="button"
                    className="stm-btn"
                    disabled={busy}
                    onClick={() => void run('/api/games/hub/moderate', { threadId: th.id, action: th.locked ? 'unlock' : 'lock' })}
                  >
                    {th.locked ? t('steam-hub-unlock', { defaultValue: 'Unlock' }) : t('steam-hub-lock', { defaultValue: 'Lock' })}
                  </button>
                  <button
                    type="button"
                    className="stm-btn"
                    disabled={busy}
                    onClick={() => void run('/api/games/hub/moderate', { threadId: th.id, action: th.pinned ? 'unpin' : 'pin' })}
                  >
                    {th.pinned ? t('steam-hub-unpin', { defaultValue: 'Unpin' }) : t('steam-hub-pin', { defaultValue: 'Pin' })}
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </article>

        <h2 className="stm-subhead stm-replies-head">
          {t('steam-hub-replies-n', { defaultValue: 'Replies: {{n}}', n: data.posts.length })}
        </h2>
        {data.posts.map((p) => (
          <article key={p.id} className="stm-web-card stm-post">
            <Author person={p.author} when={p.createdAt} />
            <div className="stm-post-main">
              <PostText className="stm-post-text" text={p.body} ownedTitles={data.authorEmotes[p.author.userId] ?? []} />
              {p.canDelete ? (
                <div className="stm-post-tools">
                  <button
                    type="button"
                    className="stm-btn"
                    disabled={busy}
                    onClick={() => void run('/api/games/hub/delete', { kind: 'post', id: p.id }, t('steam-hub-deleted', { defaultValue: 'Deleted.' }))}
                  >
                    {t('steam-hub-delete', { defaultValue: 'Delete' })}
                  </button>
                </div>
              ) : null}
            </div>
          </article>
        ))}

        {th.locked ? (
          <p className="stm-muted">{t('steam-hub-locked-note', { defaultValue: 'This discussion is locked.' })}</p>
        ) : data.signedIn ? (
          <form
            className="stm-web-card stm-hub-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run('/api/games/hub/post', { threadId: th.id, body: reply }, undefined, async () => {
                setReply('');
                await router.invalidate();
              });
            }}
          >
            <label>
              <span className="stm-subhead">{t('steam-hub-reply', { defaultValue: 'Reply' })}</span>
              <textarea
                className="stm-textarea"
                rows={4}
                value={reply}
                maxLength={MAX_POST}
                onChange={(e) => setReply(e.target.value)}
                required
              />
            </label>
            <div className="stm-write-actions">
              <button type="submit" className="stm-btn stm-btn-blue" disabled={busy || reply.trim().length === 0}>
                {t('steam-hub-post', { defaultValue: 'Post' })}
              </button>
              <EmotePicker titles={data.myEmoteTitles} onPick={(tok) => setReply((r) => (r ? `${r} ${tok}` : tok))} />
            </div>
          </form>
        ) : (
          <p className="stm-muted">
            <a className="stm-link" href={`/login?callbackURL=${encodeURIComponent(`/games/hub/${data.gameId}/t/${th.id}`)}`}>
              {t('steam-sign-in', { defaultValue: 'Sign in' })}
            </a>{' '}
            {t('steam-hub-signin-reply', { defaultValue: 'to reply.' })}
          </p>
        )}
      </div>
    </div>
  );
}
