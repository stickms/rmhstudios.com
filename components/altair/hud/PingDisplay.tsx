/**
 * PingDisplay — Renders ping markers and quick chat messages on the game screen.
 *
 * Shows contextual ping indicators (colored circles, crosshairs, exclamation points),
 * screen-edge indicators for off-screen pings, and floating quick chat text above senders.
 */

'use client';

import { useMemo } from 'react';
import { PLAYER_SLOT_COLORS } from '@/lib/altair/engine/types';
import type { PingData, PingType, QuickChatData, PlayerStateSnapshot } from '@/lib/altair/multiplayer/types';

interface PingDisplayProps {
  pings: PingData[];
  quickChats: QuickChatData[];
  players: PlayerStateSnapshot[];
  cameraX: number;
  cameraY: number;
  screenWidth: number;
  screenHeight: number;
}

const PING_COLORS: Record<PingType, string> = {
  general: '#4A9EFF',
  target: '#FF4A4A',
  boss: '#FFD84A',
  help: '#4AFF7A',
  item: '#FBBF24',
  danger: '#EF4444',
};

const PING_LABELS: Record<PingType, string> = {
  general: 'Ping',
  target: 'Attack',
  boss: 'Boss',
  help: 'Help!',
  item: 'Item',
  danger: 'Danger!',
};

const PING_DURATION_MS = 4000;
const QUICK_CHAT_DURATION_MS = 3000;

export default function PingDisplay({
  pings,
  quickChats,
  players,
  cameraX,
  cameraY,
  screenWidth,
  screenHeight,
}: PingDisplayProps) {
  const now = Date.now();

  // Filter active pings
  const activePings = useMemo(
    () => pings.filter((p) => now - p.timestamp < PING_DURATION_MS),
    [pings, now],
  );

  // Filter active quick chats
  const activeChats = useMemo(
    () => quickChats.filter((c) => now - c.timestamp < QUICK_CHAT_DURATION_MS),
    [quickChats, now],
  );

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {/* Ping markers */}
      {activePings.map((ping, i) => {
        const age = now - ping.timestamp;
        const opacity = Math.max(0, 1 - age / PING_DURATION_MS);
        const screenX = ping.x - cameraX + screenWidth / 2;
        const screenY = ping.y - cameraY + screenHeight / 2;
        const isOnScreen = screenX >= -20 && screenX <= screenWidth + 20 && screenY >= -20 && screenY <= screenHeight + 20;
        const color = PING_COLORS[ping.type];

        if (isOnScreen) {
          return (
            <PingMarker
              key={`ping-${ping.timestamp}-${i}`}
              x={screenX}
              y={screenY}
              type={ping.type}
              color={color}
              opacity={opacity}
              age={age}
            />
          );
        }

        // Off-screen indicator
        const angle = Math.atan2(screenY - screenHeight / 2, screenX - screenWidth / 2);
        const edgeX = Math.cos(angle) * (screenWidth / 2 - 30) + screenWidth / 2;
        const edgeY = Math.sin(angle) * (screenHeight / 2 - 30) + screenHeight / 2;

        return (
          <div
            key={`ping-edge-${ping.timestamp}-${i}`}
            className="absolute flex items-center justify-center"
            style={{
              left: `${Math.max(10, Math.min(screenWidth - 10, edgeX))}px`,
              top: `${Math.max(10, Math.min(screenHeight - 10, edgeY))}px`,
              transform: 'translate(-50%, -50%)',
              opacity,
            }}
          >
            <div
              className="w-6 h-6 rounded-full border-2 flex items-center justify-center animate-pulse"
              style={{ borderColor: color, backgroundColor: `${color}30` }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" style={{ transform: `rotate(${angle}rad)` }}>
                <polygon points="10,5 2,1 4,5 2,9" fill={color} />
              </svg>
            </div>
          </div>
        );
      })}

      {/* Quick chat floating text */}
      {activeChats.map((chat, i) => {
        const player = players.find((p) => p.playerId === chat.playerId);
        if (!player) return null;

        const age = now - chat.timestamp;
        const opacity = Math.max(0, 1 - age / QUICK_CHAT_DURATION_MS);
        const screenX = player.x - cameraX + screenWidth / 2;
        const screenY = player.y - cameraY + screenHeight / 2 - 50 - (age / QUICK_CHAT_DURATION_MS) * 30;
        const color = PLAYER_SLOT_COLORS[player.slot] || '#fff';

        return (
          <div
            key={`chat-${chat.timestamp}-${i}`}
            className="absolute text-center"
            style={{
              left: `${screenX}px`,
              top: `${screenY}px`,
              transform: 'translate(-50%, -50%)',
              opacity,
            }}
          >
            <span
              className="px-2 py-0.5 rounded-md bg-black/60 text-xs font-bold whitespace-nowrap"
              style={{ color }}
            >
              {chat.message}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function PingMarker({
  x,
  y,
  type,
  color,
  opacity,
  age,
}: {
  x: number;
  y: number;
  type: PingType;
  color: string;
  opacity: number;
  age: number;
}) {
  // Expanding ring animation
  const ringScale = 1 + (age / PING_DURATION_MS) * 0.5;

  return (
    <div
      className="absolute flex flex-col items-center gap-1"
      style={{
        left: `${x}px`,
        top: `${y}px`,
        transform: 'translate(-50%, -50%)',
        opacity,
      }}
    >
      {/* Outer ring */}
      <div
        className="absolute w-10 h-10 rounded-full border-2"
        style={{
          borderColor: color,
          transform: `scale(${ringScale})`,
          opacity: 0.5,
        }}
      />

      {/* Inner marker */}
      {type === 'target' ? (
        // Crosshair
        <svg width="24" height="24" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="8" fill="none" stroke={color} strokeWidth="2" />
          <line x1="12" y1="2" x2="12" y2="8" stroke={color} strokeWidth="2" />
          <line x1="12" y1="16" x2="12" y2="22" stroke={color} strokeWidth="2" />
          <line x1="2" y1="12" x2="8" y2="12" stroke={color} strokeWidth="2" />
          <line x1="16" y1="12" x2="22" y2="12" stroke={color} strokeWidth="2" />
        </svg>
      ) : type === 'danger' || type === 'help' ? (
        // Exclamation
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center font-black text-sm"
          style={{ backgroundColor: color, color: '#000' }}
        >
          !
        </div>
      ) : type === 'boss' ? (
        // Skull shape
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center text-sm"
          style={{ backgroundColor: `${color}80`, border: `2px solid ${color}` }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14">
            <circle cx="7" cy="6" r="5" fill={color} />
            <circle cx="5" cy="5" r="1.5" fill="#000" />
            <circle cx="9" cy="5" r="1.5" fill="#000" />
            <rect x="5.5" y="9" width="1" height="2" fill={color} />
            <rect x="7.5" y="9" width="1" height="2" fill={color} />
          </svg>
        </div>
      ) : (
        // Default circle
        <div
          className="w-5 h-5 rounded-full"
          style={{ backgroundColor: `${color}80`, border: `2px solid ${color}` }}
        />
      )}

      {/* Label */}
      <span
        className="text-[10px] font-bold whitespace-nowrap bg-black/50 px-1 rounded"
        style={{ color }}
      >
        {PING_LABELS[type]}
      </span>
    </div>
  );
}
