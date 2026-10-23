"use client";
import { useCookgameStore } from '@/lib/cookgame/store';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';

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
      <DialogContent
        aria-describedby={undefined}
        overlayClassName="bg-black/60"
        data-jelly="off" data-liquid-material="off" data-dialog-shell="bare"
        className="max-w-[640px] gap-0 rounded-none border-0 bg-transparent p-0 shadow-none [&>button]:hidden"
      >
        {/* The game's own dark panel is the surface: its text is light-on-dark in every site theme. */}
        <div className="rounded-lg border border-neutral-700 bg-neutral-900 p-4 text-white sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <DialogTitle className="font-mono tracking-widest text-lime-400">{title}</DialogTitle>
            <DialogClose className="px-2 py-1 text-sm text-neutral-400 hover:text-white pointer-coarse:min-h-11">
              Close ✕
            </DialogClose>
          </div>
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}
