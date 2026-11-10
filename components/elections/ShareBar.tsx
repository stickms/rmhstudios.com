import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Link2, Send, Share2 } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { api } from '@/lib/contract/client';
import { createRMHarkApi } from '@/lib/feed/compose-assist.contract';

const enc = encodeURIComponent;

/**
 * Share a link with text: the native sheet where the browser has one, the big
 * networks as plain intent links (no SDKs, no trackers), copy, and — signed in —
 * a post straight to the RMH feed, where the link unfurls with its OG card.
 */
export function ShareBar({
  url,
  text,
  disabled,
}: {
  url: string;
  text: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation('c-elections');
  const { data: session } = useSession();
  const [copied, setCopied] = useState(false);
  const [posted, setPosted] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');

  const canNative = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      window.prompt(t('share.copyPrompt', { defaultValue: 'Copy this link:' }), url);
    }
  };

  const postToFeed = async () => {
    setPosted('busy');
    try {
      // 280 is the feed's limit: the link always survives, the text is trimmed to fit.
      const room = 280 - url.length - 1;
      const content = `${text.length > room ? `${text.slice(0, Math.max(0, room - 1))}…` : text} ${url}`.trim();
      await api(createRMHarkApi, { body: { content } });
      setPosted('done');
    } catch {
      setPosted('error');
    }
  };

  const links: { key: string; label: string; href: string }[] = [
    { key: 'x', label: 'X', href: `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}` },
    { key: 'bsky', label: 'Bluesky', href: `https://bsky.app/intent/compose?text=${enc(`${text} ${url}`)}` },
    { key: 'reddit', label: 'Reddit', href: `https://www.reddit.com/submit?url=${enc(url)}&title=${enc(text)}` },
    { key: 'wa', label: 'WhatsApp', href: `https://wa.me/?text=${enc(`${text} ${url}`)}` },
  ];

  return (
    <div className="el-pick-row" role="group" aria-label={t('share.group', { defaultValue: 'Share' })}>
      {canNative ? (
        <button
          type="button"
          className="el-btn el-btn--sm"
          disabled={disabled}
          onClick={() => navigator.share({ title: text, text, url }).catch(() => undefined)}
        >
          <Share2 size={14} aria-hidden />
          {t('share.native', { defaultValue: 'Share…' })}
        </button>
      ) : null}
      <button type="button" className="el-btn el-btn--sm el-btn--ghost" disabled={disabled} onClick={copy}>
        {copied ? <Check size={14} aria-hidden /> : <Link2 size={14} aria-hidden />}
        {copied ? t('share.copied', { defaultValue: 'Copied' }) : t('share.copy', { defaultValue: 'Copy link' })}
      </button>
      {links.map((l) => (
        <a
          key={l.key}
          className="el-btn el-btn--sm el-btn--ghost"
          href={disabled ? undefined : l.href}
          aria-disabled={disabled}
          target="_blank"
          rel="noopener noreferrer"
        >
          {l.label}
        </a>
      ))}
      {session ? (
        <button
          type="button"
          className="el-btn el-btn--sm el-btn--pink"
          disabled={disabled || posted === 'busy' || posted === 'done'}
          onClick={postToFeed}
        >
          <Send size={14} aria-hidden />
          {posted === 'done'
            ? t('share.posted', { defaultValue: 'Posted' })
            : posted === 'error'
              ? t('share.retry', { defaultValue: 'Try again' })
              : t('share.feed', { defaultValue: 'Post to feed' })}
        </button>
      ) : null}
    </div>
  );
}
