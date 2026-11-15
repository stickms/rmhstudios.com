import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { IslandProviders } from './IslandProviders';
import { ISLAND_ROOT_ID, readIslandData } from './island-data';

/**
 * Mount an island's tree into the document `lib/islands/document.server.ts`
 * rendered (redesign audit B1). The server sends a loading frame inside
 * `#island-root`, not the island's markup, so this is a client render
 * (`createRoot`), not a hydration: there is nothing to mismatch, and the
 * island's first paint is the frame, then the island.
 */
export function mountIsland(app: ReactNode): void {
  const el = document.getElementById(ISLAND_ROOT_ID);
  if (!el) throw new Error(`island: #${ISLAND_ROOT_ID} is missing from the document`);
  createRoot(el).render(<IslandProviders data={readIslandData()}>{app}</IslandProviders>);
}
