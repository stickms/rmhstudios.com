import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { StickyNote, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useArrival } from '@/components/ui/arrive';
import { fetchJson } from '@/lib/http';
import { cn } from '@/lib/utils';

interface Note {
  id: string;
  body: string;
  mine: boolean;
  myRating: boolean | null;
  helpfulCount?: number;
  notCount?: number;
}
interface NotesData {
  shown: Note[];
  pending: Note[];
}

/**
 * X3 — context notes under a post. Shown notes passed the bridging rule
 * (rated helpful by raters who usually disagree); pending notes are for
 * signed-in members to rate. Loaded on demand, never with the feed.
 */
export default function ContextNotes({ postId }: { postId: string }) {
  const { t } = useTranslation('f-canvas');
  const { data: session } = useSession();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: ['context-notes', postId, !!session],
    queryFn: () => fetchJson<NotesData>(`/api/context-notes?postId=${encodeURIComponent(postId)}`),
  });
  // Steel M9: the notes land after the section's heading has painted.
  const arrival = useArrival(!!q.data);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await q.refetch();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : t('note-error', { defaultValue: 'Something went wrong' }),
      );
    } finally {
      setBusy(false);
    }
  };
  const json = (body: unknown) => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const rate = (n: Note, helpful: boolean) =>
    act(() => fetchJson(`/api/context-notes/${n.id}/rate`, json({ helpful })));

  const ratingRow = (n: Note) =>
    session && !n.mine ? (
      <div className="flex items-center gap-2">
        <Button
          size="xs"
          variant={n.myRating === true ? 'default' : 'default'}
          aria-pressed={n.myRating === true}
          disabled={busy}
          onClick={() => void rate(n, true)}
        >
          <ThumbsUp />
          {t('note-helpful', { defaultValue: 'Helpful' })}
        </Button>
        <Button
          size="xs"
          variant={n.myRating === false ? 'default' : 'default'}
          aria-pressed={n.myRating === false}
          disabled={busy}
          onClick={() => void rate(n, false)}
        >
          <ThumbsDown />
          {t('note-not-helpful', { defaultValue: 'Not helpful' })}
        </Button>
      </div>
    ) : null;

  const hasMine = q.data?.pending.some((n) => n.mine) || q.data?.shown.some((n) => n.mine);
  return (
    <section
      aria-label={t('notes-label', { defaultValue: 'Context notes' })}
      className="mt-2 min-h-16 space-y-3 rounded-site p-4"
    >
      <h3 className="flex items-center gap-2 text-sm font-semibold text-site-text">
        <StickyNote className="size-4" aria-hidden />
        {t('notes-label', { defaultValue: 'Context notes' })}
      </h3>
      {q.data?.shown.map((n) => (
        <div key={n.id} className={cn('space-y-2', arrival)}>
          <p className="text-sm text-site-text">{n.body}</p>
          <p className="text-xs text-site-text-muted">
            {t('note-bridged', {
              defaultValue: 'Rated helpful by people who often disagree with each other.',
            })}
          </p>
          {ratingRow(n)}
        </div>
      ))}
      {q.data && q.data.pending.length > 0 && (
        <div className={cn('space-y-3', arrival)}>
          <p className="text-xs font-medium text-site-text-muted">
            {t('note-pending', { defaultValue: 'Proposed notes waiting for ratings' })}
          </p>
          {q.data.pending.map((n) => (
            <div key={n.id} className="space-y-2">
              <p className="text-sm text-site-text">{n.body}</p>
              {n.mine ? (
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    void act(() => fetchJson(`/api/context-notes/${n.id}`, { method: 'DELETE' }))
                  }
                >
                  {t('note-withdraw', { defaultValue: 'Withdraw my note' })}
                </Button>
              ) : (
                ratingRow(n)
              )}
            </div>
          ))}
        </div>
      )}
      {q.data && q.data.shown.length === 0 && q.data.pending.length === 0 && (
        <p className={cn('text-sm text-site-text-muted', arrival)}>
          {t('note-none', { defaultValue: 'No notes yet. If this post needs context, add one.' })}
        </p>
      )}
      {session && !hasMine && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              await fetchJson('/api/context-notes', json({ postId, body: draft }));
              setDraft('');
              toast.success(
                t('note-proposed', { defaultValue: 'Note proposed. Others can now rate it.' }),
              );
            });
          }}
        >
          <Textarea
            value={draft}
            maxLength={500}
            rows={3}
            onChange={(e) => setDraft(e.target.value)}
            aria-label={t('note-draft', { defaultValue: 'Propose a context note' })}
            placeholder={t('note-draft', { defaultValue: 'Propose a context note' })}
          />
          <Button
            type="submit"
            size="sm"
            variant="default"
            loading={busy}
            disabled={draft.trim().length < 10}
          >
            {t('note-propose', { defaultValue: 'Propose note' })}
          </Button>
        </form>
      )}
    </section>
  );
}
