"use client";
import { useCookgameStore } from '@/lib/cookgame/store';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

/**
 * A station / buyer overlay. The world keeps running behind it (WorldTicker drives the clock), so
 * this never pauses anything; the overlay's open state is the store's `activeOverlay`. Radix owns
 * Escape, the focus trap and the close button, and every one of them routes to the same
 * `setActiveOverlay(null)` the hand-built frame used.
 */
export function OverlayFrame({ title, children }: { title: string; children: React.ReactNode }) {
  const close = () => useCookgameStore.getState().setActiveOverlay(null);
  return (
    <Dialog open onOpenChange={(next) => { if (!next) close(); }}>
      <DialogContent aria-describedby={undefined} className="max-w-[640px] text-site-text">
        <DialogTitle className="font-mono tracking-widest text-lime-400">{title}</DialogTitle>
        {children}
      </DialogContent>
    </Dialog>
  );
}
