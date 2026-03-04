'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Link2, Check } from 'lucide-react';

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  url: string;
  text?: string;
}

export function ShareModal({ open, onClose, url, text }: ShareModalProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  useEffect(() => {
    if (copied) {
      const t = setTimeout(() => setCopied(false), 2000);
      return () => clearTimeout(t);
    }
  }, [copied]);

  if (!open) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
    }
  };

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
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          ref={contentRef}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-sm bg-site-bg border border-site-border rounded-2xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-site-border">
            <h2 className="font-bold text-site-text">Share</h2>
            <button
              onClick={onClose}
              className="p-1 rounded-full hover:bg-site-surface transition-colors text-site-text-dim hover:text-site-text"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Share options */}
          <div className="p-3 space-y-1">
            <button
              onClick={handleCopy}
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm text-site-text hover:bg-site-surface transition-colors"
            >
              {copied ? (
                <Check className="w-5 h-5 text-green-500" />
              ) : (
                <Link2 className="w-5 h-5 text-site-text-dim" />
              )}
              {copied ? 'Copied!' : 'Copy link'}
            </button>

            <button
              onClick={shareToX}
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm text-site-text hover:bg-site-surface transition-colors"
            >
              <svg className="w-5 h-5 text-site-text-dim" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              Share on X
            </button>

            <button
              onClick={shareToFacebook}
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm text-site-text hover:bg-site-surface transition-colors"
            >
              <svg className="w-5 h-5 text-site-text-dim" viewBox="0 0 24 24" fill="currentColor">
                <path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 1.09.044 1.613.115V7.78c-.344-.036-.94-.054-1.684-.054-2.39 0-3.316.905-3.316 3.26v1.058h4.612l-.683 3.667h-3.929v8.08c5.013-.838 8.828-5.12 8.828-10.311C20.4 7.216 16.472 3 12 3S3.6 7.216 3.6 13.48c0 4.785 3.274 8.778 7.694 9.954z" />
              </svg>
              Share on Facebook
            </button>

            <button
              onClick={shareToEmail}
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm text-site-text hover:bg-site-surface transition-colors"
            >
              <svg className="w-5 h-5 text-site-text-dim" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="20" height="16" x="2" y="4" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
              Share via Email
            </button>
          </div>

          {/* URL preview */}
          <div className="px-4 pb-4">
            <div className="flex items-center gap-2 bg-site-surface rounded-lg px-3 py-2 text-xs text-site-text-dim font-mono truncate">
              <Link2 className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{url}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
