/**
 * Athora — Proximity Chat Overlay
 *
 * Renders floating speech bubbles above avatars when they send proximity messages.
 * Messages fade out after a few seconds.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { useAthoraStore } from "@/stores/athoraStore";
import type { ProximityMsgPayload } from "@/types/athora";
import type { RoomEngine } from "@/lib/athora/room-engine/Engine";

interface FloatingMessage {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  expiresAt: number;
}

const MESSAGE_DURATION = 5000; // 5 seconds
const MAX_VISIBLE = 8;

interface ProximityChatOverlayProps {
  engineRef: React.RefObject<RoomEngine | null>;
}

export function ProximityChatOverlay({ engineRef }: ProximityChatOverlayProps) {
  const [floatingMessages, setFloatingMessages] = useState<FloatingMessage[]>([]);
  const proximityMessages = useAthoraStore((s) => s.proximityMessages);
  const users = useAthoraStore((s) => s.users);
  const lastMsgRef = useAthoraStore((s) => s.proximityMessages.length);

  // Track new messages
  useEffect(() => {
    if (proximityMessages.length === 0) return;

    const newest = proximityMessages[proximityMessages.length - 1];
    if (!newest) return;

    setFloatingMessages((prev) => {
      // Avoid duplicates
      if (prev.some((m) => m.id === newest.id)) return prev;

      const msg: FloatingMessage = {
        id: newest.id,
        senderId: newest.senderId,
        senderName: newest.senderName,
        content: newest.content,
        expiresAt: Date.now() + MESSAGE_DURATION,
      };

      return [...prev.slice(-MAX_VISIBLE + 1), msg];
    });
  }, [lastMsgRef, proximityMessages]);

  // Expire old messages
  useEffect(() => {
    if (floatingMessages.length === 0) return;

    const timer = setInterval(() => {
      const now = Date.now();
      setFloatingMessages((prev) => prev.filter((m) => m.expiresAt > now));
    }, 500);

    return () => clearInterval(timer);
  }, [floatingMessages.length]);

  if (floatingMessages.length === 0) return null;

  return (
    <div className="absolute inset-0 z-5 pointer-events-none overflow-hidden">
      {floatingMessages.map((msg) => {
        const user = users.get(msg.senderId);
        if (!user) return null;

        // Calculate remaining time for opacity
        const remaining = msg.expiresAt - Date.now();
        const opacity = Math.min(1, remaining / 1000); // fade in last second

        return (
          <div
            key={msg.id}
            className="absolute top-4 left-1/2 -translate-x-1/2 animate-in fade-in slide-in-from-bottom-2 duration-300"
            style={{ opacity: Math.max(0, opacity) }}
          >
            <div className="bg-gray-900/90 backdrop-blur-sm border border-gray-700 rounded-lg px-3 py-1.5 max-w-xs">
              <span className="text-indigo-400 text-[10px] font-semibold mr-1.5">
                {msg.senderName}:
              </span>
              <span className="text-gray-200 text-[11px]">{msg.content}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
