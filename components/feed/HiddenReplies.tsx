import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { MenuItem } from '@/components/ui/menu';
import { SpineItem } from '@/components/ui/spine';
import { hideCommentApi } from '@/lib/feed/rmhark-actions.contract';
import { api } from '@/lib/contract/client';

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
      await api(hideCommentApi, { params: { id: postId, commentId }, body: { hidden: next } });
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

/**
 * The collapsed disclosure the hidden replies sit under, for everyone reading the conversation. Its toggle is a dotless
 * spine item (P3: it is a control, not a reply) and, once open, the replies follow it as siblings on the same spine, so
 * their dots stay on the line. It belongs inside a `Spine`: the post's reply list or a reply's nested spine. Nothing
 * animates (M6): the chevron flips, it does not turn.
 */
export function HiddenRepliesGroup({ count, children }: { count: number; children: ReactNode }) {
  const { t } = useTranslation('f-feed-plus');
  const [open, setOpen] = useState(false);
  const panelId = useId();
  if (count === 0) return null;
  return (
    <>
      <SpineItem dot={false}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
          className="feed-action"
        >
          {t('hidden-replies', { n: count, defaultValue: 'Hidden replies ({{n}})' })}
          {open ? (
            <ChevronUp className="size-3.5" aria-hidden />
          ) : (
            <ChevronDown className="size-3.5" aria-hidden />
          )}
        </button>
      </SpineItem>
      <div id={panelId} hidden={!open}>
        {open ? children : null}
      </div>
    </>
  );
}
