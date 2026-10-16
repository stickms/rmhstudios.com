'use client';

import { lazy, Suspense, useEffect, useState } from 'react';
import { useLocation } from '@tanstack/react-router';
import { games } from '@/lib/games';

const PatchNotesDialog = lazy(() =>
  import('./PatchNotesDialog').then((m) => ({ default: m.PatchNotesDialog })),
);

const GAME_PATHS = new Set(
  games.filter((g) => !g.unlisted && g.href.startsWith('/')).map((g) => g.href),
);
const seenKey = (gameId: string) => `rmh:patch-seen:${gameId}`;

export interface PatchNote {
  version: string;
  title: string;
  body: string;
}

function readSeen(gameId: string): string | null {
  try {
    return localStorage.getItem(seenKey(gameId));
  } catch {
    return null;
  }
}
function writeSeen(gameId: string, version: string) {
  try {
    localStorage.setItem(seenKey(gameId), version);
  } catch {
    /* private mode: the note simply shows again next launch */
  }
}

/**
 * Mounted once in Providers. On landing on a game route it asks for that game's
 * latest patch note and shows it once per version. A player with no stored
 * version yet is treated as new: we record the current version and stay quiet.
 */
export function PatchNotesMount() {
  const pathname = useLocation({ select: (l) => l.pathname });
  const [state, setState] = useState<{ gameId: string; note: PatchNote } | null>(null);

  useEffect(() => {
    if (!pathname || !GAME_PATHS.has(pathname)) return;
    let live = true;
    const timer = window.setTimeout(() => {
      fetch(`/api/arcade/patch-notes?path=${encodeURIComponent(pathname)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { gameId: string | null; note: PatchNote | null } | null) => {
          if (!live || !d?.gameId || !d.note) return;
          const seen = readSeen(d.gameId);
          if (seen === d.note.version) return;
          if (seen === null) return writeSeen(d.gameId, d.note.version);
          setState({ gameId: d.gameId, note: d.note });
        })
        .catch(() => {});
    }, 1500);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [pathname]);

  if (!state) return null;
  return (
    <Suspense fallback={null}>
      <PatchNotesDialog
        note={state.note}
        onClose={() => {
          writeSeen(state.gameId, state.note.version);
          setState(null);
        }}
      />
    </Suspense>
  );
}
