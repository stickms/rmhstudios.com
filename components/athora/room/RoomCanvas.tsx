/**
 * Athora — Room Canvas
 *
 * React wrapper around the PixiJS-based RoomEngine.
 * Handles canvas lifecycle and connects to socket sync.
 */

"use client";

import { useEffect, useRef } from "react";
import { RoomEngine } from "@/lib/athora/room-engine/Engine";
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

  // Use refs to avoid re-running the effect when callbacks/objects change
  const socketRef = useRef(socket);
  socketRef.current = socket;
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;
  const onAvatarClickRef = useRef(onAvatarClick);
  onAvatarClickRef.current = onAvatarClick;
  const onStandClickRef = useRef(onStandClick);
  onStandClickRef.current = onStandClick;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let destroyed = false;
    let engine: RoomEngine | null = null;

    // Delay creation by one frame so React Strict Mode's first mount
    // gets cancelled before any WebGL context is acquired on the canvas.
    const frame = requestAnimationFrame(() => {
      if (destroyed) return;

      RoomEngine.create({
        canvas,
        socket: socketRef.current,
        currentUser: currentUserRef.current,
        onAvatarClick: (userId: string) => onAvatarClickRef.current(userId),
        onStandClick: (standId: string) => onStandClickRef.current(standId),
        onEmptyClick: () => {},
      })
        .then((e) => {
          if (destroyed) {
            e.destroy();
            return;
          }
          engine = e;
          engineRef.current = e;
        })
        .catch((err) => {
          console.error("RoomEngine init failed:", err);
        });
    });

    return () => {
      destroyed = true;
      cancelAnimationFrame(frame);
      if (engine) {
        engine.destroy();
        engineRef.current = null;
      }
    };
  // Only create the engine once when the component mounts
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
