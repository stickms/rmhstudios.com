/**
 * Athora — Room Canvas
 *
 * React wrapper around the PixiJS-based RoomEngine.
 * Handles canvas lifecycle and connects to socket sync.
 */

"use client";

import { useEffect, useRef, useCallback } from "react";
import { RoomEngine } from "@/lib/athora/room-engine/Engine";
import { useAthoraStore } from "@/stores/athoraStore";
import type { Socket } from "socket.io-client";
import type { CurrentUser } from "@/types/athora";

interface RoomCanvasProps {
  socket: Socket;
  currentUser: CurrentUser;
  engineRef: React.MutableRefObject<RoomEngine | null>;
  onAvatarClick: (userId: string) => void;
  onStandClick: (standId: string) => void;
}

export function RoomCanvas({
  socket,
  currentUser,
  engineRef,
  onAvatarClick,
  onStandClick,
}: RoomCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleEmptyClick = useCallback((worldX: number, worldY: number) => {
    // Could open a context menu or start a conversation
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new RoomEngine({
      canvas: canvasRef.current,
      socket,
      currentUser,
      onAvatarClick,
      onStandClick,
      onEmptyClick: handleEmptyClick,
    });

    engineRef.current = engine;

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, [socket, currentUser, onAvatarClick, onStandClick, handleEmptyClick, engineRef]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (!canvasRef.current || !containerRef.current) return;
      canvasRef.current.width = containerRef.current.clientWidth;
      canvasRef.current.height = containerRef.current.clientHeight;
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        style={{ touchAction: "none" }}
      />
    </div>
  );
}
