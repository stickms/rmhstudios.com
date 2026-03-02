/**
 * MultiplayerGameScreen — Renders the multiplayer game canvas.
 *
 * Host: runs full simulation via createMultiplayerGameLoop, broadcasts state.
 * Client: receives snapshots, interpolates, renders.
 * Both: send local input at 20Hz, handle level-up overlay.
 *
 * TODO: Full implementation in Phase 3F.
 */

'use client';

import { useEffect, useRef } from 'react';
import { useAltairMultiplayerStore } from '@/lib/altair/multiplayer/store';

interface MultiplayerGameScreenProps {
  lobbyId: string;
}

export default function MultiplayerGameScreen({ lobbyId }: MultiplayerGameScreenProps) {
  const lobby = useAltairMultiplayerStore((s) => s.lobby);
  const gameSnapshot = useAltairMultiplayerStore((s) => s.gameSnapshot);
  const isHost = useAltairMultiplayerStore((s) => s.isHost);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  return (
    <div className="fixed inset-0 bg-(--altair-bg)">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
      />

      {/* Temporary overlay showing game is running */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2 rounded-lg bg-black/60 backdrop-blur-sm">
        <div className="w-2 h-2 rounded-full bg-(--altair-success) animate-pulse" />
        <span className="text-sm text-white font-mono">
          {isHost ? 'HOST' : 'CLIENT'} — Lobby {lobbyId}
        </span>
        {gameSnapshot && (
          <span className="text-xs text-white/60">
            Tick {gameSnapshot.tick} | {gameSnapshot.players?.length ?? 0} players | {gameSnapshot.enemies?.length ?? 0} enemies
          </span>
        )}
      </div>
    </div>
  );
}
