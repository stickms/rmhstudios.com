'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link2, Check, Code2, QrCode as QrIcon, ImageDown } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useClipboard } from '@/hooks/useClipboard';
import { QrCode } from './QrCode';

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  url: string;
  text?: string;
  /** When set, offers an "Embed" option with an iframe snippet for this post,
   *  plus a downloadable 9:16 "share to Stories" image. */
  embedId?: string;
}

export function ShareModal({ open, onClose, url, text, embedId }: ShareModalProps) {
  const { t } = useTranslation('feed');
  const { copied, copy } = useClipboard();
  const { copied: embedCopied, copy: copyEmbed } = useClipboard();
  const [showQr, setShowQr] = useState(false);

  const embedCode = embedId
    ? `<iframe src="https://rmhstudios.com/embed/post/${embedId}" width="100%" height="320" frameborder="0" style="border:1px solid #2a2a2a;border-radius:16px;max-width:560px" title="RMH Studios post"></iframe>`
    : null;

  const handleCopy = () => copy(url);

  const shareToX = () => {
    const params = new URLSearchParams({ url, ...(text ? { text } : {}) });
    window.open(`https://x.com/intent/tweet?${params}`, '_blank', 'noopener');
  };

  const shareToFacebook = () => {
    const params = new URLSearchParams({ u: url });
    window.open(`https://www.facebook.com/sharer/sharer.php?${params}`, '_blank', 'noopener');
  };

  const shareToEmail = () => {
    const subject = text || 'Check this out on RMH';
    const body = `${text ? text + '\n\n' : ''}${url}`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm p-0 gap-0 overflow-hidden bg-site-bg">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-site-border">
          <DialogTitle className="font-bold text-site-text">{t('share-title', { defaultValue: 'Share' })}</DialogTitle>
        </div>

          {/* Share options */}
          <div className="p-3 space-y-1">
            <button
              onClick={handleCopy}
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-site text-sm text-site-text hover:bg-site-surface transition-colors"
            >
              {copied ? (
                <Check className="w-5 h-5 text-site-success" />
              ) : (
                <Link2 className="w-5 h-5 text-site-text-dim" />
              )}
              {copied ? t('copied', { defaultValue: 'Copied!' }) : t('copy-link', { defaultValue: 'Copy link' })}
            </button>

            <button
              onClick={shareToX}
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-site text-sm text-site-text hover:bg-site-surface transition-colors"
            >
              <svg className="w-5 h-5 text-site-text-dim" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              {t('share-on-x', { defaultValue: 'Share on X' })}
            </button>

            <button
              onClick={shareToFacebook}
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-site text-sm text-site-text hover:bg-site-surface transition-colors"
            >
              <svg className="w-5 h-5 text-site-text-dim" viewBox="0 0 24 24" fill="currentColor">
                <path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 1.09.044 1.613.115V7.78c-.344-.036-.94-.054-1.684-.054-2.39 0-3.316.905-3.316 3.26v1.058h4.612l-.683 3.667h-3.929v8.08c5.013-.838 8.828-5.12 8.828-10.311C20.4 7.216 16.472 3 12 3S3.6 7.216 3.6 13.48c0 4.785 3.274 8.778 7.694 9.954z" />
              </svg>
              {t('share-on-facebook', { defaultValue: 'Share on Facebook' })}
            </button>

            <button
              onClick={shareToEmail}
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-site text-sm text-site-text hover:bg-site-surface transition-colors"
            >
              <svg className="w-5 h-5 text-site-text-dim" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="20" height="16" x="2" y="4" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
              {t('share-via-email', { defaultValue: 'Share via Email' })}
            </button>

            {/* Downloadable 9:16 "share to Stories" image (posts only) */}
            {embedId && (
              <a
                href={`/api/og/post/${embedId}/story`}
                download={`rmh-story-${embedId}.png`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 w-full px-3 py-2.5 rounded-site text-sm text-site-text hover:bg-site-surface transition-colors"
              >
                <ImageDown className="w-5 h-5 text-site-text-dim" />
                {t('share-to-stories', { defaultValue: 'Download story image' })}
              </a>
            )}

            {/* QR code (cross-device / IRL sharing) */}
            <button
              onClick={() => setShowQr((v) => !v)}
              aria-expanded={showQr}
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-site text-sm text-site-text hover:bg-site-surface transition-colors"
            >
              <QrIcon className="w-5 h-5 text-site-text-dim" />
              {showQr ? t('hide-qr-code', { defaultValue: 'Hide QR code' }) : t('show-qr-code', { defaultValue: 'Show QR code' })}
            </button>
            {showQr && (
              <div className="flex justify-center py-2">
                <div className="rounded-site bg-white p-3">
                  <QrCode value={url} size={168} />
                </div>
              </div>
            )}
          </div>

          {embedCode && (
            <div className="px-3 pb-1">
              <button
                onClick={() => copyEmbed(embedCode)}
                className="flex items-center gap-3 w-full px-3 py-2.5 rounded-site text-sm text-site-text hover:bg-site-surface transition-colors"
              >
                {embedCopied ? (
                  <Check className="w-5 h-5 text-site-success" />
                ) : (
                  <Code2 className="w-5 h-5 text-site-text-dim" />
                )}
                {embedCopied ? t('embed-code-copied', { defaultValue: 'Embed code copied!' }) : t('copy-embed-code', { defaultValue: 'Copy embed code' })}
              </button>
            </div>
          )}

          {/* URL preview */}
          <div className="px-4 pb-4">
            <div className="flex items-center gap-2 bg-site-surface rounded-site-sm px-3 py-2 text-xs text-site-text-dim font-mono truncate">
              <Link2 className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{url}</span>
            </div>
          </div>
      </DialogContent>
    </Dialog>
  );
}
