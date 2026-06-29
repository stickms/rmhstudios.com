'use client';

import { useState, useSyncExternalStore } from 'react';
import { Monitor } from 'lucide-react';

const COARSE_QUERY = '(pointer: coarse)';

function subscribe(callback: () => void) {
  const mql = window.matchMedia(COARSE_QUERY);
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

function getSnapshot() {
  return window.matchMedia(COARSE_QUERY).matches;
}

function getServerSnapshot() {
  // Assume a fine pointer on the server; the client corrects after hydration.
  return false;
}

/**
 * True on devices whose primary pointer is coarse (touch) with no precise
 * mouse. Used to gate experiences that depend on pointer-lock / mouse-look /
 * keyboard input, which cannot work on a touchscreen.
 */
export function useCoarsePointer() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

interface DesktopControlsGateProps {
  /** Name shown in the message, e.g. "Forest Explorer". */
  gameName: string;
  /** Where the "Go back" link points. */
  backTo?: string;
  children: React.ReactNode;
}

/**
 * Renders `children` on devices with a fine pointer (mouse/trackpad). On
 * touch-only devices it shows a "needs a keyboard & mouse" interstitial
 * instead of mounting a pointer-lock experience that would be unusable — with
 * a "Continue anyway" escape hatch so a capable device that merely reports a
 * coarse pointer (e.g. a tablet with a mouse attached) is never locked out.
 */
export function DesktopControlsGate({ gameName, backTo = '/', children }: DesktopControlsGateProps) {
  const coarse = useCoarsePointer();
  const [override, setOverride] = useState(false);

  if (!coarse || override) return <>{children}</>;

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-black px-6 text-center">
      <Monitor className="h-12 w-12 text-zinc-500" />
      <div className="space-y-2">
        <h1 className="text-xl font-semibold text-white">
          {gameName} needs a keyboard &amp; mouse
        </h1>
        <p className="max-w-xs text-sm text-zinc-400">
          This experience uses mouse-look and keyboard controls that aren&apos;t available on a
          touchscreen. For the best experience, open it on a desktop or laptop.
        </p>
      </div>
      <div className="flex flex-col items-center gap-3">
        <a
          href={backTo}
          className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-zinc-200"
        >
          Go back
        </a>
        <button
          onClick={() => setOverride(true)}
          className="text-xs text-zinc-500 underline-offset-4 hover:text-zinc-300 hover:underline"
        >
          Continue anyway
        </button>
      </div>
    </div>
  );
}
