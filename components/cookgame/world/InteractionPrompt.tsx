"use client";
import { useCookgameStore } from '@/lib/cookgame/store';

const LABELS: Record<string, string> = {
  supplier: 'Supplier',
  mixing: 'Mixing Bench',
  packaging: 'Packaging',
  doug: 'Doug',
  kim: 'Kim',
  pablo: 'Pablo',
  'plot:0': 'Grow Plot 1',
  'plot:1': 'Grow Plot 2',
  'plot:2': 'Grow Plot 3',
  drying: 'Drying Rack',
  chem: 'Chemistry Station',
  property: 'Manage Property',
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
