'use client';

import { toast } from 'sonner';
import type { useNavigate } from '@tanstack/react-router';
import type { MentionNotification } from '@/lib/feed-sse';

type NavigateFn = ReturnType<typeof useNavigate>;

/**
 * Surface a real-time "you were mentioned" toast (pushed over the feed SSE
 * stream, targeted to the mentioned user). Clicking it deep-links to the post.
 */
export function showMentionToast(n: MentionNotification, navigate: NavigateFn) {
  const userid = n.author.handle || n.author.id;
  const display = n.author.name || (n.author.handle ? `@${n.author.handle}` : 'Someone');

  toast.custom(
    (id) => (
      <button
        onClick={() => {
          navigate({ to: '/u/$userid/post/$postid', params: { userid, postid: n.rmharkId } });
          toast.dismiss(id);
        }}
        className="flex items-start gap-3 w-full text-left p-3 rounded-xl bg-site-bg border border-site-border shadow-xl hover:bg-site-surface/60 transition-colors"
      >
        <span className="w-9 h-9 rounded-full bg-white/10 shrink-0 overflow-hidden flex items-center justify-center text-sm font-bold text-site-text">
          {n.author.image ? (
            <img
              src={n.author.image}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/images/social/default_avatar.png';
              }}
            />
          ) : (
            display[0]?.toUpperCase() || 'U'
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm text-site-text">
            <span className="font-semibold">{display}</span> mentioned you
          </span>
          {n.preview && (
            <span className="block text-xs text-site-text-dim truncate mt-0.5">{n.preview}</span>
          )}
        </span>
      </button>
    ),
    { duration: 6000 },
  );
}
