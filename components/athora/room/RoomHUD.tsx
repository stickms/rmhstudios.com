/**
 * Athora — Room HUD
 *
 * Overlay UI rendered on top of the PixiJS canvas.
 * Shows room info, user count, availability picker, host controls, and leave button.
 */

"use client";

import { useState } from "react";
import { useAthoraStore } from "@/stores/athoraStore";
import type { AthoraAvailability, AthoraRoomAccess } from "@/types/athora";
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

const ACCESS_OPTIONS: {
  value: AthoraRoomAccess;
  label: string;
  icon: string;
}[] = [
  { value: "PUBLIC", label: "Public", icon: "🌐" },
  { value: "PRIVATE", label: "Request Only", icon: "🔒" },
  { value: "INVITE_ONLY", label: "Invite Only", icon: "✉️" },
];

interface RoomHUDProps {
  socket: Socket | null;
  currentUserId: string;
  onLeave: () => void;
}

export function RoomHUD({ socket, currentUserId, onLeave }: RoomHUDProps) {
  const currentRoom = useAthoraStore((s) => s.currentRoom);
  const users = useAthoraStore((s) => s.users);
  const myAvailability = useAthoraStore((s) => s.myAvailability);
  const setMyAvailability = useAthoraStore((s) => s.setMyAvailability);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showHostMenu, setShowHostMenu] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  const isHost = currentRoom?.ownerId === currentUserId;

  const currentStatus =
    AVAILABILITY_OPTIONS.find((o) => o.value === myAvailability) ??
    AVAILABILITY_OPTIONS[0];

  const handleStatusChange = (status: AthoraAvailability) => {
    setMyAvailability(status);
    socket?.emit("athora:room:status", { availability: status });
    setShowStatusMenu(false);
  };

  const handleAccessChange = (accessType: AthoraRoomAccess) => {
    if (!currentRoom) return;
    socket?.emit("athora:room:settings", { roomId: currentRoom.id, accessType });
    setShowHostMenu(false);
  };

  const handleCloseRoom = () => {
    if (!currentRoom) return;
    socket?.emit("athora:room:settings", { roomId: currentRoom.id, isActive: false });
    setShowCloseConfirm(false);
    setShowHostMenu(false);
    // Redirect host back to map after closing
    onLeave();
  };

  if (!currentRoom) return null;

  const currentAccess = ACCESS_OPTIONS.find((o) => o.value === currentRoom.accessType) ?? ACCESS_OPTIONS[0];

  return (
    <div className="absolute top-0 left-0 right-0 z-10 pointer-events-none">
      <div className="flex items-start justify-between p-4">
        {/* Room info */}
        <div className="pointer-events-auto bg-gray-900/80 backdrop-blur-sm rounded-lg border border-gray-700 p-3">
          <div className="flex items-center gap-2">
            <h2 className="text-white font-bold text-sm">
              {currentRoom.name}
            </h2>
            {isHost && (
              <span className="text-[10px] bg-indigo-600/50 text-indigo-300 px-1.5 py-0.5 rounded-full">
                Host
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
            <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
            {users.size} {users.size === 1 ? "person" : "people"} here
            <span className="text-gray-600">·</span>
            <span className={currentRoom.accessType === "PUBLIC" ? "text-green-400" : "text-yellow-400"}>
              {currentAccess.icon} {currentAccess.label}
            </span>
          </div>
        </div>

        {/* Right-side controls */}
        <div className="pointer-events-auto flex items-center gap-2">
          {/* Host controls */}
          {isHost && (
            <div className="relative">
              <button
                onClick={() => { setShowHostMenu(!showHostMenu); setShowStatusMenu(false); }}
                className="bg-indigo-600/80 backdrop-blur-sm rounded-lg border border-indigo-500/50
                           px-3 py-2 text-white text-xs font-medium
                           hover:bg-indigo-600 transition-colors flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Room
              </button>

              {showHostMenu && (
                <div className="absolute right-0 mt-1 bg-gray-900 border border-gray-700 rounded-lg overflow-hidden shadow-xl w-48">
                  <div className="px-3 py-2 text-[10px] uppercase tracking-wide text-gray-500 font-semibold border-b border-gray-800">
                    Room Access
                  </div>
                  {ACCESS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => handleAccessChange(opt.value)}
                      className={`w-full px-3 py-2 text-left text-xs flex items-center gap-2
                                 hover:bg-gray-800 transition-colors ${
                                   opt.value === currentRoom.accessType
                                     ? "text-white bg-gray-800"
                                     : "text-gray-300"
                                 }`}
                    >
                      <span>{opt.icon}</span>
                      {opt.label}
                      {opt.value === currentRoom.accessType && (
                        <svg className="w-3 h-3 ml-auto text-indigo-400" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                  ))}
                  <div className="border-t border-gray-800">
                    <button
                      onClick={() => setShowCloseConfirm(true)}
                      className="w-full px-3 py-2 text-left text-xs text-red-400 hover:bg-red-900/30 transition-colors flex items-center gap-2"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                      Close Room
                    </button>
                  </div>
                </div>
              )}

              {/* Close confirmation modal */}
              {showCloseConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 pointer-events-auto" onClick={() => setShowCloseConfirm(false)}>
                  <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 w-80 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                    <h3 className="text-white font-bold text-sm mb-2">Close Room?</h3>
                    <p className="text-gray-400 text-xs mb-4">
                      This will kick all users and deactivate the room. The room will no longer appear on the map.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowCloseConfirm(false)}
                        className="flex-1 px-3 py-2 text-xs text-gray-300 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleCloseRoom}
                        className="flex-1 px-3 py-2 text-xs text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
                      >
                        Close Room
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Availability picker */}
          <div className="relative">
            <button
              onClick={() => { setShowStatusMenu(!showStatusMenu); setShowHostMenu(false); }}
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
