"use client";
import { useCookgameStore } from '@/lib/cookgame/store';

const LABELS: Record<string, string> = {
  supplier: 'Supplier',
  mixing: 'Mixing Bench',
  packaging: 'Packaging',
  doug: 'Doug',
  kim: 'Kim',
  pablo: 'Pablo',
};

export function InteractionPrompt() {
  const near = useCookgameStore((s) => s.nearbyInteractable);
  const overlay = useCookgameStore((s) => s.activeOverlay);
  if (!near || overlay) return null;
  return (
    <div className="absolute bottom-24 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded bg-black/70 text-white text-sm font-mono pointer-events-none">
      Press <span className="text-lime-400">E</span> — {LABELS[near] ?? near}
    </div>
  );
}
