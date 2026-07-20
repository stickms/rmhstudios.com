'use client';

/**
 * Shareable stat cards (§13) — the reusable share sheet.
 *
 * Opening the sheet IS the share intent, so it lazily creates a `SharedMoment`
 * (POST /api/moments) once and then offers: copy link, share to feed (composer
 * prefilled with the landing link), native share, and download-for-stories.
 * Wire it into celebration surfaces (level-up / achievement / wheel / wrapped /
 * ranked promotion — see integration notes).
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Check, Copy, Download, Link2, Loader2, Send, Share2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

export type ShareMomentKind =
  'achievement' | 'rank' | 'streak' | 'pass_tier' | 'arcade' | 'wrapped_stat' | 'market';

export interface ShareMomentPayload {
  title?: string;
  value: string;
  subtitle?: string;
}

interface ShareMomentSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: ShareMomentKind;
  payload: ShareMomentPayload;
}

export function ShareMomentSheet({ open, onOpenChange, kind, payload }: ShareMomentSheetProps) {
  const { t } = useTranslation('site');
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [moment, setMoment] = useState<{ id: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);

  useEffect(() => {
    setCanNativeShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);

  // Create the moment once when the sheet opens (nothing is public until now).
  const create = useCallback(async () => {
    setCreating(true);
    try {
      const res = await fetch('/api/moments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ kind, payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.id && data.url) {
        setMoment({ id: data.id, url: data.url });
      } else if (res.status === 401) {
        toast.error(t('share-moment-sign-in', { defaultValue: 'Please sign in to share.' }));
        onOpenChange(false);
      } else {
        toast.error(
          data.error || t('share-moment-error', { defaultValue: 'Could not create share link' }),
        );
        onOpenChange(false);
      }
    } catch {
      toast.error(t('share-moment-error', { defaultValue: 'Could not create share link' }));
      onOpenChange(false);
    } finally {
      setCreating(false);
    }
  }, [kind, payload, onOpenChange, t]);

  // Create exactly one moment per sheet: the guards make this idempotent even
  // if the parent passes a fresh `payload` object each render.
  useEffect(() => {
    if (!open || moment || creating) return;
    void create();
  }, [open, moment, creating, create]);

  const copyLink = async () => {
    if (!moment) return;
    try {
      await navigator.clipboard.writeText(moment.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success(t('share-moment-copied', { defaultValue: 'Link copied' }));
    } catch {
      toast.error(t('share-moment-copy-failed', { defaultValue: 'Could not copy link' }));
    }
  };

  const shareToFeed = () => {
    if (!moment) return;
    onOpenChange(false);
    // The /share route stitches the fields into a composer draft (it unfurls
    // via the OG image on the feed's own link-preview path).
    void navigate({ to: '/share', search: { title: '', text: payload.value, url: moment.url } });
  };

  const nativeShare = async () => {
    if (!moment) return;
    try {
      await navigator.share({
        title: payload.title || payload.value,
        text: payload.value,
        url: moment.url,
      });
    } catch {
      /* user cancelled — no-op */
    }
  };

  const download = () => {
    if (!moment) return;
    const a = document.createElement('a');
    a.href = `/api/og/moment/${moment.id}?variant=story`;
    a.download = `rmh-moment-${moment.id}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const actionClass =
    'flex w-full items-center gap-3 rounded-site border border-site-border bg-site-surface px-4 py-3 text-left text-sm font-medium text-site-text transition-colors hover:bg-site-surface-hover disabled:opacity-50';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-site-accent" aria-hidden />
            {t('share-moment-title', { defaultValue: 'Share this moment' })}
          </DialogTitle>
          <DialogDescription>{payload.value}</DialogDescription>
        </DialogHeader>

        {creating || !moment ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-site-text-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            {t('share-moment-preparing', { defaultValue: 'Preparing your card…' })}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {/* Card preview */}
            <div className="mb-1 overflow-hidden rounded-site border border-site-border">
              <img
                src={`/api/og/moment/${moment.id}`}
                alt={payload.value}
                width={1200}
                height={630}
                className="h-auto w-full"
              />
            </div>

            <button type="button" onClick={copyLink} className={actionClass}>
              {copied ? (
                <Check className="h-4 w-4 shrink-0 text-site-success" aria-hidden />
              ) : (
                <Copy className="h-4 w-4 shrink-0 text-site-text-muted" aria-hidden />
              )}
              {copied
                ? t('share-moment-copied', { defaultValue: 'Link copied' })
                : t('share-moment-copy', { defaultValue: 'Copy link' })}
            </button>

            <button type="button" onClick={shareToFeed} className={actionClass}>
              <Send className="h-4 w-4 shrink-0 text-site-text-muted" aria-hidden />
              {t('share-moment-to-feed', { defaultValue: 'Share to feed' })}
            </button>

            {canNativeShare && (
              <button type="button" onClick={nativeShare} className={actionClass}>
                <Link2 className="h-4 w-4 shrink-0 text-site-text-muted" aria-hidden />
                {t('share-moment-native', { defaultValue: 'Share via…' })}
              </button>
            )}

            <button type="button" onClick={download} className={actionClass}>
              <Download className="h-4 w-4 shrink-0 text-site-text-muted" aria-hidden />
              {t('share-moment-download', { defaultValue: 'Download for stories' })}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
