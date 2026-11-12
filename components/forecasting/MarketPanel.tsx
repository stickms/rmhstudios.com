import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Swords } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { AI_TIMEOUT_MS, api } from '@/lib/contract/client';
import {
  addPredictionCommentApi,
  devilsAdvocateApi,
  listPredictionCommentsApi,
} from '@/lib/predictions/predictions.contract';

function ago(ts: number, now: number): string {
  const m = Math.max(0, Math.round((now - ts) / 60_000));
  return m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
}

interface Comment {
  id: string;
  body: string;
  side: string | null;
  shares: number;
  createdAt: string;
  user: { id: string; name: string | null; handle: string | null };
}

interface Props {
  marketId: string;
  signedIn: boolean;
  held: 'YES' | 'NO' | null;
}

export function MarketPanel({ marketId, signedIn, held }: Props) {
  const { t } = useTranslation('f-forecasting');
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [arguing, setArguing] = useState(false);
  const [argument, setArgument] = useState<{ side: 'YES' | 'NO'; text: string } | null>(null);

  const load = useCallback(() => {
    api(listPredictionCommentsApi, { params: { id: marketId } })
      .then((d) => {
        setComments(d.comments);
        setAiAvailable(d.aiAvailable);
      })
      .catch(() => setComments([]));
  }, [marketId]);

  useEffect(load, [load]);

  async function post() {
    if (posting || !draft.trim()) return;
    setPosting(true);
    try {
      const d = await api(addPredictionCommentApi, {
        params: { id: marketId },
        body: { body: draft },
      });
      setComments((prev) => [d.comment, ...(prev ?? [])]);
      setDraft('');
    } catch {
      toast.error(t('post-failed', { defaultValue: 'Could not post your comment' }));
    } finally {
      setPosting(false);
    }
  }

  // Argue for the side the viewer does not hold; with no position, challenge the favourite-agnostic NO.
  const target: 'YES' | 'NO' = held === 'YES' ? 'NO' : held === 'NO' ? 'YES' : 'NO';

  async function advocate() {
    if (arguing) return;
    setArguing(true);
    try {
      const d = await api(devilsAdvocateApi, {
        params: { id: marketId },
        body: { side: target },
        timeoutMs: AI_TIMEOUT_MS,
      });
      setArgument({ side: d.side, text: d.argument });
    } catch {
      toast.error(
        t('advocate-failed', { defaultValue: 'Could not generate an argument right now' }),
      );
    } finally {
      setArguing(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-site-sm surface-field px-4 py-3">
      {aiAvailable && signedIn && (
        <div className="flex flex-col gap-2">
          <Button
            variant="default"
            size="sm"
            className="self-start"
            onClick={advocate}
            loading={arguing}
          >
            <Swords className="size-4" aria-hidden />
            {target === 'YES'
              ? t('advocate-yes', { defaultValue: "Devil's advocate: the case for YES" })
              : t('advocate-no', { defaultValue: "Devil's advocate: the case for NO" })}
          </Button>
          {argument && (
            <div className="text-sm text-site-text">
              <p className="whitespace-pre-line">{argument.text}</p>
              <p className="mt-2 text-xs text-site-text-muted">
                {t('advocate-note', {
                  defaultValue: 'AI-written, no sources checked. Verify before you trade on it.',
                })}
              </p>
            </div>
          )}
        </div>
      )}

      {signedIn && (
        <div className="flex flex-col gap-2">
          <Textarea
            value={draft}
            maxLength={500}
            rows={2}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t('placeholder', { defaultValue: 'Share your reasoning' })}
            aria-label={t('placeholder', { defaultValue: 'Share your reasoning' })}
          />
          <Button
            variant="default"
            size="sm"
            className="self-end"
            onClick={post}
            loading={posting}
            disabled={!draft.trim()}
          >
            {t('post', { defaultValue: 'Post' })}
          </Button>
        </div>
      )}

      {comments === null ? (
        <Spinner size={16} />
      ) : comments.length === 0 ? (
        <p className="text-xs text-site-text-muted">
          {t('no-comments', { defaultValue: 'No comments yet.' })}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {comments.map((c) => (
            <li key={c.id} className="text-sm">
              <div className="flex flex-wrap items-center gap-2 text-xs text-site-text-muted">
                <span className="font-medium text-site-text">
                  {c.user.name ?? c.user.handle ?? ''}
                </span>
                {c.side && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
                      c.side === 'YES'
                        ? 'bg-site-success/15 text-site-success'
                        : 'bg-site-danger/15 text-site-danger'
                    }`}
                  >
                    {t('held', { defaultValue: 'Held {{n}} {{side}}', n: c.shares, side: c.side })}
                  </span>
                )}
                <RelativeTime date={c.createdAt} format={ago} />
              </div>
              <p className="whitespace-pre-line break-words">{c.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
