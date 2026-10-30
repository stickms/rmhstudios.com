/**
 * Invite to a Balatro lobby (LOB-04): the lobby code and a link that joins it
 * (`/balatro?lobby=CODE`, which survives the sign-in detour). Lua asks for it
 * with `ui_invite`; the friends list arrives from the hub directory (WS12) and
 * is passed in as `friends`.
 *
 * A `components/ui` Dialog portaled into the game frame (`container`): the frame
 * is what goes fullscreen and carries the page's `--app-*` palette, so a dialog
 * on <body> would be invisible in fullscreen.
 */
'use client';

import { Check, Copy } from 'lucide-react';
import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useLobbyLink } from '@/hooks/useLobbyLink';

export function InvitePopover({
  code,
  open,
  onOpenChange,
  container,
  friends,
}: {
  code: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  container: HTMLElement | null;
  friends?: ReactNode;
}) {
  const { t } = useTranslation('c-balatro');
  const { link, copied, copyLink } = useLobbyLink({ code, path: '/balatro' });

  const copy = async () => {
    if (!(await copyLink())) toast.message(link);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent container={container} className="max-w-sm">
        <DialogTitle>{t('mp_invite_title', { defaultValue: 'Invite to lobby' })}</DialogTitle>
        <DialogDescription>
          {t('mp_invite_body', { defaultValue: 'Share the code, or a link that opens this lobby.' })}
        </DialogDescription>
        <p className="font-mono text-2xl tracking-widest" aria-label={t('mp_invite_code', { defaultValue: 'Lobby code' })}>
          {code}
        </p>
        <button type="button" className="balatro-action" onClick={() => void copy()}>
          {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          {copied
            ? t('mp_invite_copied', { defaultValue: 'Link copied' })
            : t('mp_invite_copy', { defaultValue: 'Copy invite link' })}
        </button>
        {friends}
      </DialogContent>
    </Dialog>
  );
}
