/**
 * "Call" — the entry point, used in a DM conversation header and on a profile.
 *
 * Renders nothing at all when a call cannot be placed (signed out, calling
 * yourself, or a browser without WebRTC), rather than showing a button that
 * fails when pressed. The server is still the authority on whether the callee
 * accepts calls from you — this is only about whether the control makes sense.
 */

'use client';

import { useTranslation } from 'react-i18next';
import { Phone } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { useCallStore, startCall } from '@/lib/call/store';
import { callSupported } from '@/lib/call/peer';
import { isBusy } from '@/lib/call/state';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props {
  /** Who to ring. */
  user: { id: string; name: string | null; image: string | null; handle?: string | null };
  /** The DM thread, when the button lives in one. */
  conversationId?: string;
  /**
   * The signed-in viewer, so the button can hide on your own profile. Optional:
   * falls back to the session, so a surface that doesn't already have the
   * viewer's id doesn't have to thread one through.
   */
  viewerId?: string | null;
  /** `icon` for a conversation header, `full` for a profile action row. */
  variant?: 'icon' | 'full';
  className?: string;
}

export function CallButton({ user, conversationId, viewerId, variant = 'icon', className }: Props) {
  const { t } = useTranslation('feed');
  const { data: session } = useSession();
  const phase = useCallStore((s) => s.phase);
  const busy = isBusy({ phase } as never);
  const viewer = viewerId ?? session?.user?.id ?? null;

  if (!viewer || viewer === user.id) return null;
  if (typeof window !== 'undefined' && !callSupported()) return null;

  const label = t('call-start', { defaultValue: 'Call' });

  return (
    <Button
      type="button"
      variant={variant === 'icon' ? 'ghost' : 'outline'}
      // Disabled rather than hidden while a call is live: the control vanishing
      // mid-call would read as a bug.
      disabled={busy}
      onClick={() =>
        void startCall(
          { id: user.id, name: user.name ?? '', image: user.image, handle: user.handle ?? null },
          conversationId,
        )
      }
      aria-label={variant === 'icon' ? label : undefined}
      className={cn(variant === 'icon' && 'h-9 w-9 rounded-full p-0', className)}
    >
      <Phone className={variant === 'icon' ? 'h-4 w-4' : 'h-4 w-4'} aria-hidden />
      {variant === 'full' && <span>{label}</span>}
    </Button>
  );
}
