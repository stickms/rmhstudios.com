'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Swords } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { RelativeTime } from '@/components/ui/RelativeTime';

function ago(ts: number, now: number): string {
  const m = Math.max(0, Math.round((now - ts) / 60_000));
  return m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
}

interface Comment {
  id: string;
  body: string;
  side: 'YES' | 'NO' | null;
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
    fetch(`/api/predictions/${marketId}/comments`)
      .then((r) => r.json())
      .then((d) => {
        setComments(d.comments ?? []);
        setAiAvailable(Boolean(d.aiAvailable));
      })
      .catch(() => setComments([]));
  }, [marketId]);

  useEffect(load, [load]);

  async function post() {
    if (posting || !draft.trim()) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/predictions/${marketId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: draft }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
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
      const res = await fetch(`/api/predictions/${marketId}/devils-advocate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ side: target }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
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
    <div className="flex flex-col gap-3 rounded-site-sm glass-inset p-3">
      {aiAvailable && signedIn && (
        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={advocate}
            disabled={arguing}
          >
            {arguing ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Swords className="w-4 h-4 mr-1" aria-hidden />
            )}
            {target === 'YES'
              ? t('advocate-yes', { defaultValue: "Devil's advocate: the case for YES" })
              : t('advocate-no', { defaultValue: "Devil's advocate: the case for NO" })}
          </Button>
          {argument && (
            <div className="text-sm text-site-text">
              <p className="whitespace-pre-line">{argument.text}</p>
              <p className="mt-1 text-[11px] text-site-text-dim">
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
            variant="accent"
            size="sm"
            className="self-end"
            onClick={post}
            disabled={posting || !draft.trim()}
          >
            {t('post', { defaultValue: 'Post' })}
          </Button>
        </div>
      )}

      {comments === null ? (
        <Loader2 className="w-4 h-4 animate-spin text-site-text-dim" />
      ) : comments.length === 0 ? (
        <p className="text-xs text-site-text-dim">
          {t('no-comments', { defaultValue: 'No comments yet.' })}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {comments.map((c) => (
            <li key={c.id} className="text-sm">
              <div className="flex items-center gap-2 flex-wrap text-xs text-site-text-dim">
                <span className="font-medium text-site-text">
                  {c.user.name ?? c.user.handle ?? ''}
                </span>
                {c.side && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
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
