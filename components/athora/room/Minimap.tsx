/**
 * Athora — Minimap
 *
 * Corner minimap showing room overview with user dots.
 */

"use client";

import { useEffect, useRef } from "react";
import { useAthoraStore } from "@/stores/athoraStore";

const MINIMAP_SIZE = 140;
const DOT_SIZE = 3;

const AVAILABILITY_COLORS: Record<string, string> = {
  OPEN_TO_CHAT: "#22c55e",
  BROWSING: "#3b82f6",
  IN_MEETING: "#ef4444",
  PITCHING: "#f59e0b",
  DO_NOT_DISTURB: "#ef4444",
  AFK: "#6b7280",
};

interface MinimapProps {
  currentUserId: string;
}

export function Minimap({ currentUserId }: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const currentRoom = useAthoraStore((s) => s.currentRoom);
  const users = useAthoraStore((s) => s.users);
  const stands = useAthoraStore((s) => s.stands);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !currentRoom) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const scaleX = MINIMAP_SIZE / currentRoom.mapWidth;
    const scaleY = MINIMAP_SIZE / currentRoom.mapHeight;
    const scale = Math.min(scaleX, scaleY);

    // Clear
    ctx.clearRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);

    // Background
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);

    // Stands
    ctx.fillStyle = "#4338ca33";
    ctx.strokeStyle = "#6366f1";
    ctx.lineWidth = 0.5;
    for (const stand of stands) {
      const x = stand.posX * scale - (stand.width * scale) / 2;
      const y = stand.posY * scale - (stand.height * scale) / 2;
      const w = stand.width * scale;
      const h = stand.height * scale;
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
    }

    // Other users
    for (const [uid, user] of users) {
      if (uid === currentUserId) continue;
      const x = user.x * scale;
      const y = user.y * scale;
      ctx.beginPath();
      ctx.arc(x, y, DOT_SIZE, 0, Math.PI * 2);
      ctx.fillStyle = AVAILABILITY_COLORS[user.availability] || "#6b7280";
      ctx.fill();
    }

    // Current user (larger, distinct)
    const me = users.get(currentUserId);
    if (me) {
      const x = me.x * scale;
      const y = me.y * scale;
      ctx.beginPath();
      ctx.arc(x, y, DOT_SIZE + 1.5, 0, Math.PI * 2);
      ctx.fillStyle = "#818cf8";
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Border
    ctx.strokeStyle = "#374151";
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
  }, [currentRoom, users, stands, currentUserId]);

  if (!currentRoom) return null;

  return (
    <div className="absolute bottom-4 left-4 z-10 pointer-events-auto">
      <canvas
        ref={canvasRef}
        width={MINIMAP_SIZE}
        height={MINIMAP_SIZE}
        className="rounded-lg border border-gray-700 bg-gray-900/80 backdrop-blur-sm"
        style={{ imageRendering: "pixelated" }}
      />
    </div>
  );
}
