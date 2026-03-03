/**
 * Athora — Room Events Display
 *
 * Shows upcoming events for the current room in the HUD.
 */

"use client";

import { useState, useEffect } from "react";
import { useAthoraStore } from "@/stores/athoraStore";

interface RoomEvent {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
  isTicketed: boolean;
  ticketPrice: number | null;
  maxAttendees: number | null;
}

export function RoomEvents() {
  const roomId = useAthoraStore((s) => s.currentRoom?.id);
  const [events, setEvents] = useState<RoomEvent[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!roomId) return;

    async function fetchEvents() {
      try {
        const res = await fetch(
          `/api/athora/events?roomId=${roomId}&upcoming=true`
        );
        if (res.ok) {
          const data = await res.json();
          setEvents(data);
        }
      } catch {
        // silently fail
      }
    }
    fetchEvents();
  }, [roomId]);

  if (events.length === 0) return null;

  const nextEvent = events[0];
  const startsAt = new Date(nextEvent.startsAt);
  const now = new Date();
  const diffMs = startsAt.getTime() - now.getTime();
  const isLive = diffMs <= 0;

  const formatCountdown = (ms: number) => {
    if (ms <= 0) return "Live now!";
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    if (hours > 24) return `in ${Math.floor(hours / 24)}d`;
    if (hours > 0) return `in ${hours}h ${minutes}m`;
    return `in ${minutes}m`;
  };

  return (
    <div className="absolute top-16 left-4 z-10 pointer-events-auto">
      <button
        onClick={() => setExpanded(!expanded)}
        className={`bg-gray-900/80 backdrop-blur-sm rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
          isLive
            ? "border-red-500/50 text-red-400"
            : "border-amber-500/30 text-amber-400"
        }`}
      >
        {isLive ? "LIVE" : formatCountdown(diffMs)}: {nextEvent.title}
      </button>

      {expanded && (
        <div className="mt-1 bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-lg p-3 w-64 shadow-xl">
          {events.slice(0, 3).map((event) => {
            const time = new Date(event.startsAt);
            return (
              <div key={event.id} className="mb-2 last:mb-0">
                <h4 className="text-white text-xs font-semibold">{event.title}</h4>
                <p className="text-gray-400 text-[10px]">
                  {time.toLocaleDateString()} at{" "}
                  {time.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
                {event.description && (
                  <p className="text-gray-500 text-[10px] mt-0.5 line-clamp-2">
                    {event.description}
                  </p>
                )}
                {event.isTicketed && (
                  <span className="text-[9px] text-amber-400 bg-amber-900/30 px-1.5 py-0.5 rounded-full mt-1 inline-block">
                    {event.ticketPrice
                      ? `$${(event.ticketPrice / 100).toFixed(2)}`
                      : "Free ticket"}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
