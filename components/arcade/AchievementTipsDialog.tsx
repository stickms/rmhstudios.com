import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { ThumbsUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSession } from '@/components/Providers';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import { api } from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import {
  listAchievementTipsApi,
  postAchievementTipApi,
  voteAchievementTipApi,
} from '@/lib/arcade/arcade.contract';

interface Tip {
  id: string;
  body: string;
  votes: number;
  author: { name?: string | null; handle?: string | null };
  isMine: boolean;
  voted: boolean;
}

export function AchievementTipsDialog({
  achievementId,
  name,
  onClose,
}: {
  achievementId: string;
  name: string;
  onClose: () => void;
}) {
  const { t } = useTranslation('f-arcade');
  const session = useSession();
  const signedIn = !!session.data?.user;
  const [tips, setTips] = useState<Tip[] | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setTips((await api(listAchievementTipsApi, { query: { achievementId }, retries: 0 })).tips);
    } catch {
      setTips([]);
    }
  }, [achievementId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function post() {
    setBusy(true);
    try {
      await api(postAchievementTipApi, { body: { achievementId, body: draft } });
    } catch (err) {
      setBusy(false);
      toast.error(serverError(err) ?? t('tip-failed', { defaultValue: 'Could not post that tip.' }));
      return;
    }
    setBusy(false);
    setDraft('');
    await load();
  }

  async function vote(tip: Tip) {
    if (!signedIn || tip.isMine) return;
    setTips(
      (prev) =>
        prev?.map((x) =>
          x.id === tip.id ? { ...x, voted: !x.voted, votes: x.votes + (x.voted ? -1 : 1) } : x,
        ) ?? prev,
    );
    await api(voteAchievementTipApi, { body: { tipId: tip.id } }).catch(() => {});
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('tips-title', { defaultValue: 'Tips: {{name}}', name })}</DialogTitle>
          <DialogDescription>
            {t('tips-desc', { defaultValue: 'Written by players, ordered by votes.' })}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-80 space-y-2 overflow-y-auto">
          {tips === null ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : tips.length === 0 ? (
            <p className="py-4 text-sm text-site-text-muted">
              {t('tips-empty', { defaultValue: 'No tips yet. Be the first to help.' })}
            </p>
          ) : (
            tips.map((tip) => (
              <div key={tip.id} className="rounded-site p-4">
                <p className="whitespace-pre-wrap break-words text-sm text-site-text">{tip.body}</p>
                <div className="mt-2 flex items-center justify-between text-xs text-site-text-muted">
                  <span className="truncate">{tip.author.name ?? tip.author.handle}</span>
                  <button
                    type="button"
                    onClick={() => void vote(tip)}
                    disabled={!signedIn || tip.isMine}
                    aria-pressed={tip.voted}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-site-sm px-1.5 py-0.5',
                      tip.voted ? 'text-site-accent' : 'text-site-text-muted',
                    )}
                  >
                    <ThumbsUp className="h-3.5 w-3.5" aria-hidden />
                    {tip.votes}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
        {signedIn ? (
          <div className="space-y-2">
            <Textarea
              rows={2}
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, 500))}
              placeholder={t('tip-placeholder', {
                defaultValue: 'Share a tip (no spoilers for secret ones)',
              })}
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="default"
                loading={busy}
                disabled={draft.trim().length < 8}
                onClick={() => void post()}
              >
                {t('tip-post', { defaultValue: 'Post tip' })}
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
