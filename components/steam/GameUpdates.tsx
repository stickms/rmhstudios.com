import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { api } from '@/lib/contract/client';
import { ARRIVE, useArrivingKeys } from '@/components/ui/arrive';
import { getGameUpdatesApi, type FollowState } from '@/lib/arcade/updates.contract';
import type { PatchNoteItem } from '@/lib/arcade/updates';
import { FollowGameButton } from './FollowGameButton';

/** The "Updates" link text of the game page's section links (that page's own strings are in `games-hub`). */
export function UpdatesLabel() {
  const { t } = useTranslation('game-updates');
  return (
    <>
      {t('updates', {
        defaultValue: 'Updates',
      })}
    </>
  );
}

/** One patch note: its headline, version and date, and the text as the admin wrote it. */
function NoteArticle({ note, className }: { note: PatchNoteItem; className?: string }) {
  const { i18n } = useTranslation('game-updates');
  // UTC so the server and the browser print the same day.
  const date = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(note.createdAt));
  return (
    <article className={`stm-update${className ? ` ${className}` : ''}`}>
      <h3 className="stm-update-title">{note.title}</h3>
      <p className="stm-update-meta">
        <span>{note.version}</span>
        <time dateTime={note.createdAt}>{date}</time>
      </p>
      <p className="stm-update-body">{note.body}</p>
    </article>
  );
}

/** The game page's Updates section: the latest three notes and a link to all of them. */
export function SteamUpdates({ gameId, notes }: { gameId: string; notes: PatchNoteItem[] }) {
  const { t } = useTranslation('game-updates');
  return (
    <section id="updates" className="stm-card" aria-labelledby="stm-updates-h">
      <h2 id="stm-updates-h" className="stm-card-head">
        {t('updates', {
          defaultValue: 'Updates',
        })}
        <Link
          to="/games/$gameId/updates"
          params={{
            gameId,
          }}
          className="stm-btn stm-card-action"
        >
          {t('all-updates', {
            defaultValue: 'All updates',
          })}
        </Link>
      </h2>
      {notes.length === 0 ? (
        <p className="stm-muted stm-card-note">
          {t('no-updates-hint', {
            defaultValue: 'Patch notes for this game will appear here.',
          })}
        </p>
      ) : (
        <div className="stm-updates">
          {notes.map((n) => (
            <NoteArticle key={n.id} note={n} />
          ))}
        </div>
      )}
    </section>
  );
}

/** The updates page: every patch note of the game, newest first, with Follow and the follower count. */
export function GameUpdates({
  gameId,
  signedIn,
  initialNotes,
  initialCursor,
  follow,
}: {
  gameId: string;
  signedIn: boolean;
  initialNotes: PatchNoteItem[];
  initialCursor: string | null;
  follow: FollowState;
}) {
  const { t } = useTranslation('game-updates');
  const [notes, setNotes] = useState(initialNotes);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [followers, setFollowers] = useState(follow.followers);
  const isNew = useArrivingKeys(notes.map((n) => n.id));

  const loadMore = async () => {
    if (!cursor) return;
    setLoading(true);
    try {
      const page = await api(getGameUpdatesApi, {
        params: {
          gameId,
        },
        query: {
          cursor,
        },
      });
      setNotes((prev) => [...prev, ...page.notes.filter((n) => !prev.some((p) => p.id === n.id))]);
      setCursor(page.nextCursor);
    } catch {
      toast.error(
        t('load-failed', {
          defaultValue: 'Could not load more updates.',
        }),
      );
    }
    setLoading(false);
  };

  return (
    <div className="stm-updates-page">
      <div className="stm-updates-bar">
        <p className="stm-muted" aria-live="polite">
          {t('followers', {
            defaultValue: '{{n}} following',
            n: followers,
          })}
        </p>
        <FollowGameButton
          gameId={gameId}
          signedIn={signedIn}
          initial={follow}
          onChange={(s) => setFollowers(s.followers)}
        />
      </div>
      {notes.length === 0 ? (
        <p className="stm-muted">
          {t('no-updates', {
            defaultValue: 'No updates yet.',
          })}
        </p>
      ) : (
        <div className="stm-updates">
          {notes.map((n) => (
            <NoteArticle key={n.id} note={n} className={isNew(n.id) ? ARRIVE : undefined} />
          ))}
        </div>
      )}
      {cursor ? (
        <div className="stm-updates-more">
          <button type="button" className="stm-btn" disabled={loading} onClick={() => void loadMore()}>
            {loading
              ? t('loading', {
                  defaultValue: 'Loading',
                })
              : t('load-more', {
                  defaultValue: 'Load more',
                })}
          </button>
        </div>
      ) : null}
    </div>
  );
}
