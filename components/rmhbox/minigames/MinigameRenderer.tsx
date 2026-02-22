/**
 * MinigameRenderer — Dynamically loads minigame components using React.lazy().
 *
 * Uses Suspense for a loading fallback and shows an error fallback
 * for unknown minigame IDs. Supports 16 minigame stubs.
 *
 * Props:
 *   minigameId: string — The ID of the minigame to render
 */
'use client';

import { lazy, Suspense, type ComponentType } from 'react';
import { Loader2 } from 'lucide-react';

interface MinigameRendererProps {
  minigameId: string;
}

/** Stub component factory — creates a simple placeholder for each minigame. */
function createStub(name: string): ComponentType {
  const Stub = () => (
    <div className="flex flex-col items-center justify-center gap-2 p-8 text-center text-[var(--rmhbox-text)]">
      <span className="text-4xl">🎮</span>
      <h3 className="text-xl font-bold">{name}</h3>
      <p className="text-sm text-[var(--rmhbox-text-muted)]">Minigame coming soon…</p>
    </div>
  );
  Stub.displayName = name;
  return Stub;
}

/**
 * Map of minigame IDs to lazy-loaded components.
 * Each resolves to a stub placeholder for now.
 */
const MINIGAME_COMPONENTS: Record<string, React.LazyExoticComponent<ComponentType>> = {
  'rhyme-time':             lazy(() => Promise.resolve({ default: createStub('Rhyme Time') })),
  'undercover-agent':       lazy(() => Promise.resolve({ default: createStub('Undercover Agent') })),
  'category-crash':         lazy(() => Promise.resolve({ default: createStub('Category Crash') })),
  'wiki-race':              lazy(() => Promise.resolve({ default: createStub('Wiki Race') })),
  'fact-or-friction':       lazy(() => Promise.resolve({ default: createStub('Fact or Friction') })),
  'undercover-editor':      lazy(() => Promise.resolve({ default: createStub('Undercover Editor') })),
  'minimalist-masterpiece': lazy(() => Promise.resolve({ default: createStub('Minimalist Masterpiece') })),
  'emoji-cinema':           lazy(() => Promise.resolve({ default: createStub('Emoji Cinema') })),
  'sequence-sam':           lazy(() => Promise.resolve({ default: createStub('Sequence Sam') })),
  'human-keyboard':         lazy(() => Promise.resolve({ default: createStub('Human Keyboard') })),
  'cursor-curling':         lazy(() => Promise.resolve({ default: createStub('Cursor Curling') })),
  'human-tetris':           lazy(() => Promise.resolve({ default: createStub('Human Tetris') })),
  'identity-crisis':        lazy(() => Promise.resolve({ default: createStub('Identity Crisis') })),
  'ranking-file':           lazy(() => Promise.resolve({ default: createStub('Ranking File') })),
  'pixel-pushers':          lazy(() => Promise.resolve({ default: createStub('Pixel Pushers') })),
  'scroll-soul':            lazy(() => Promise.resolve({ default: createStub('Scroll & Soul') })),
};

/** Loading fallback shown while the component loads. */
function LoadingFallback() {
  return (
    <div className="flex items-center justify-center gap-2 p-8 text-[var(--rmhbox-text-muted)]">
      <Loader2 className="h-6 w-6 animate-spin" />
      <span>Loading minigame…</span>
    </div>
  );
}

/** Error fallback for unknown minigame IDs. */
function UnknownMinigame({ id }: { id: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
      <span className="text-4xl">❓</span>
      <h3 className="text-lg font-bold text-[var(--rmhbox-danger)]">Unknown Minigame</h3>
      <p className="text-sm text-[var(--rmhbox-text-muted)]">
        No component found for &quot;{id}&quot;
      </p>
    </div>
  );
}

export default function MinigameRenderer({ minigameId }: MinigameRendererProps) {
  const LazyComponent = MINIGAME_COMPONENTS[minigameId];

  if (!LazyComponent) {
    return <UnknownMinigame id={minigameId} />;
  }

  return (
    <Suspense fallback={<LoadingFallback />}>
      <LazyComponent />
    </Suspense>
  );
}
