/**
 * Athora — Room HUD
 *
 * Overlay UI rendered on top of the PixiJS canvas.
 * Shows room info, user count, availability picker, and leave button.
 */

"use client";

import { useState } from "react";
import { useAthoraStore } from "@/stores/athoraStore";
import type { AthoraAvailability } from "@/types/athora";
import type { Socket } from "socket.io-client";

const AVAILABILITY_OPTIONS: {
  value: AthoraAvailability;
  label: string;
  color: string;
}[] = [
  { value: "OPEN_TO_CHAT", label: "Open to Chat", color: "bg-green-500" },
  { value: "BROWSING", label: "Browsing", color: "bg-blue-500" },
  { value: "IN_MEETING", label: "In Meeting", color: "bg-red-500" },
  { value: "PITCHING", label: "Pitching", color: "bg-amber-500" },
  { value: "DO_NOT_DISTURB", label: "Do Not Disturb", color: "bg-red-500" },
  { value: "AFK", label: "AFK", color: "bg-gray-500" },
];

interface RoomHUDProps {
  socket: Socket | null;
  onLeave: () => void;
}

export function RoomHUD({ socket, onLeave }: RoomHUDProps) {
  const { currentRoom, users, myAvailability, setMyAvailability } =
    useAthoraStore();
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  const currentStatus =
    AVAILABILITY_OPTIONS.find((o) => o.value === myAvailability) ??
    AVAILABILITY_OPTIONS[0];

  const handleStatusChange = (status: AthoraAvailability) => {
    setMyAvailability(status);
    socket?.emit("athora:room:status", { availability: status });
    setShowStatusMenu(false);
  };

  if (!currentRoom) return null;

  return (
    <div className="absolute top-0 left-0 right-0 z-10 pointer-events-none">
      <div className="flex items-start justify-between p-4">
        {/* Room info */}
        <div className="pointer-events-auto bg-gray-900/80 backdrop-blur-sm rounded-lg border border-gray-700 p-3">
          <h2 className="text-white font-bold text-sm">
            {currentRoom.name}
          </h2>
          <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
            <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
            {users.size} {users.size === 1 ? "person" : "people"} here
          </div>
        </div>

        {/* Right-side controls */}
        <div className="pointer-events-auto flex items-center gap-2">
          {/* Availability picker */}
          <div className="relative">
            <button
              onClick={() => setShowStatusMenu(!showStatusMenu)}
              className="bg-gray-900/80 backdrop-blur-sm rounded-lg border border-gray-700
                         px-3 py-2 text-white text-xs font-medium
                         hover:bg-gray-800 transition-colors flex items-center gap-2"
            >
              <span
                className={`w-2 h-2 rounded-full ${currentStatus.color}`}
              />
              {currentStatus.label}
            </button>

            {showStatusMenu && (
              <div className="absolute right-0 mt-1 bg-gray-900 border border-gray-700 rounded-lg overflow-hidden shadow-xl w-44">
                {AVAILABILITY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handleStatusChange(opt.value)}
                    className={`w-full px-3 py-2 text-left text-xs flex items-center gap-2
                               hover:bg-gray-800 transition-colors ${
                                 opt.value === myAvailability
                                   ? "text-white bg-gray-800"
                                   : "text-gray-300"
                               }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${opt.color}`}
                    />
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Leave button */}
          <button
            onClick={onLeave}
            className="bg-red-600/80 backdrop-blur-sm rounded-lg border border-red-500/50
                       px-3 py-2 text-white text-xs font-medium
                       hover:bg-red-600 transition-colors"
          >
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}
