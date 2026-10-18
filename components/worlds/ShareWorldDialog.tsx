'use client';

import { useCallback, useEffect, useState } from 'react';
import { EyeOff, Eye, Link2, Share2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { visitPath, type SnapshotKind } from '@/lib/worlds/schema';

interface Mine {
  code: string;
  title: string;
  updatedAt: string;
  postcards: { id: string; body: string; hidden: boolean; author: { name: string } }[];
}

/**
 * Publish / refresh / unpublish the member's read-only snapshot of one world and
 * moderate the postcards visitors leave on it. `getPayload` returns the current
 * game state to publish (null for the farm, which the server builds itself).
 */
export function ShareWorldDialog({
  kind,
  open,
  onOpenChange,
  getPayload,
  title,
}: {
  kind: SnapshotKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  getPayload?: () => unknown;
  title: string;
}) {
  const { t } = useTranslation('f-worlds');
  const [mine, setMine] = useState<Mine | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/worlds/snapshots?kind=${kind}`).catch(() => null);
    if (!res) return;
    if (res.status === 401) return setSignedOut(true);
    if (res.ok) setMine(((await res.json()) as { snapshot: Mine | null }).snapshot);
  }, [kind]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  async function publish() {
    setBusy(true);
    try {
      const res = await fetch('/api/worlds/snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(getPayload ? { kind, payload: getPayload() } : { kind }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(err.error ?? t('share-failed', { defaultValue: 'Could not publish.' }));
      } else {
        toast.success(t('share-published', { defaultValue: 'Snapshot published.' }));
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function unpublish() {
    setBusy(true);
    await fetch(`/api/worlds/snapshots?kind=${kind}`, { method: 'DELETE' }).catch(() => null);
    setMine(null);
    setBusy(false);
  }

  async function toggleHidden(id: string, hidden: boolean) {
    await fetch('/api/worlds/postcards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, hidden }),
    });
    await load();
  }

  const link = mine ? `${window.location.origin}${visitPath(kind, mine.code)}` : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="size-4" aria-hidden />
            {title}
          </DialogTitle>
          <DialogDescription>
            {t('share-desc', {
              defaultValue:
                'Publish a read-only copy that anyone with the link can visit. It does not change when you play on, until you refresh it.',
            })}
          </DialogDescription>
        </DialogHeader>

        {signedOut ? (
          <p className="text-sm text-site-text-muted">
            {t('share-signin', { defaultValue: 'Sign in to share.' })}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {mine && (
              <div className="glass-inset flex items-center gap-2 rounded-site px-3 py-2">
                <Link2 className="size-4 shrink-0 text-site-text-dim" aria-hidden />
                <code className="min-w-0 flex-1 truncate text-xs text-site-text">{link}</code>
                <CopyButton value={link} label={t('share-copy', { defaultValue: 'Copy link' })} />
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={busy} onClick={publish}>
                {mine
                  ? t('share-refresh', { defaultValue: 'Refresh snapshot' })
                  : t('share-publish', { defaultValue: 'Publish snapshot' })}
              </Button>
              {mine && (
                <Button size="sm" variant="outline" disabled={busy} onClick={unpublish}>
                  {t('share-unpublish', { defaultValue: 'Unpublish' })}
                </Button>
              )}
            </div>
            {mine && (
              <div className="flex flex-col gap-1.5">
                <h3 className="site-section-label">
                  {t('share-postcards', { defaultValue: 'Postcards' })}
                </h3>
                {mine.postcards.length === 0 && (
                  <p className="text-sm text-site-text-muted">
                    {t('share-no-postcards', { defaultValue: 'No postcards yet.' })}
                  </p>
                )}
                {mine.postcards.map((p) => (
                  <div
                    key={p.id}
                    className="glass-inset flex items-start gap-2 rounded-site px-2.5 py-1.5 text-sm"
                  >
                    <span
                      className={
                        p.hidden
                          ? 'min-w-0 flex-1 text-site-text-dim line-through'
                          : 'min-w-0 flex-1'
                      }
                    >
                      <span className="font-medium text-site-text">{p.author.name}</span>
                      <span className="text-site-text-muted"> - {p.body}</span>
                    </span>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label={
                        p.hidden
                          ? t('share-show', { defaultValue: 'Show postcard' })
                          : t('share-hide', { defaultValue: 'Hide postcard' })
                      }
                      onClick={() => toggleHidden(p.id, !p.hidden)}
                    >
                      {p.hidden ? <Eye aria-hidden /> : <EyeOff aria-hidden />}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
