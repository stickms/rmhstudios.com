'use client';

import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { MenuItem } from '@/components/ui/menu';

/**
 * X2 — hidden replies, the two UI pieces.
 *
 * `HideReplyMenuItem` is the post author's "Hide reply" / "Unhide reply" row in
 * a reply's overflow menu. `HiddenRepliesGroup` is the collapsed disclosure the
 * hidden replies sit under for everyone reading the conversation. Hiding never
 * deletes or notifies: the reply is one click away, which is what makes it a
 * softer tool than blocking or reporting.
 */

export function HideReplyMenuItem({
  postId,
  commentId,
  hidden,
  onChanged,
  onDone,
}: {
  postId: string;
  commentId: string;
  hidden: boolean;
  /** Called with the new hidden state once the server has accepted it. */
  onChanged: (hidden: boolean) => void;
  /** Close the surrounding menu. */
  onDone: () => void;
}) {
  const { t } = useTranslation('f-feed-plus');

  const toggle = async () => {
    onDone();
    const next = !hidden;
    try {
      const res = await fetch(`/api/rmharks/${postId}/comment/${commentId}/hide`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hidden: next }),
      });
      if (!res.ok) throw new Error(String(res.status));
      onChanged(next);
      toast.success(
        next
          ? t('reply-hidden', { defaultValue: 'Reply hidden. It is under "Hidden replies".' })
          : t('reply-unhidden', { defaultValue: 'Reply is visible again' }),
      );
    } catch {
      toast.error(t('reply-hide-failed', { defaultValue: 'Could not update that reply' }));
    }
  };

  return (
    <MenuItem icon={hidden ? Eye : EyeOff} onSelect={() => void toggle()}>
      {hidden
        ? t('reply-unhide', { defaultValue: 'Unhide reply' })
        : t('reply-hide', { defaultValue: 'Hide reply' })}
    </MenuItem>
  );
}

export function HiddenRepliesGroup({ count, children }: { count: number; children: ReactNode }) {
  const { t } = useTranslation('f-feed-plus');
  const [open, setOpen] = useState(false);
  const panelId = useId();
  if (count === 0) return null;
  return (
    <div className="py-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex min-h-9 pointer-coarse:min-h-11 w-full items-center gap-1.5 rounded-site-sm px-2 text-sm font-medium text-site-text-muted transition-colors hover:bg-site-surface-hover hover:text-site-text"
      >
        <EyeOff className="h-4 w-4 shrink-0" aria-hidden />
        <span className="flex-1 text-left">
          {t('hidden-replies', { n: count, defaultValue: 'Hidden replies ({{n}})' })}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-transform duration-site-fast ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open && (
        <div id={panelId} className="mt-1 divide-y divide-site-border">
          {children}
        </div>
      )}
    </div>
  );
}
