'use client';

import { useState, useEffect } from 'react';
import { Plus, Users, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBlackjackStore } from '@/lib/blackjack/store';
import { getBlackjackSocket } from '@/lib/blackjack/socket';
import { C2S } from '@/lib/blackjack/events';

export function BlackjackLobby() {
  const roomList = useBlackjackStore((s) => s.roomList);
  const [showCreate, setShowCreate] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(6);

  // Poll room list
  useEffect(() => {
    const sock = getBlackjackSocket();
    if (!sock) return;
    sock.emit(C2S.LIST_ROOMS);
    const interval = setInterval(() => sock.emit(C2S.LIST_ROOMS), 5000);
    return () => clearInterval(interval);
  }, []);

  const handleCreate = () => {
    const sock = getBlackjackSocket();
    if (!sock) return;
    sock.emit(C2S.CREATE_ROOM, {
      name: roomName.trim() || undefined,
      maxPlayers,
    });
    setShowCreate(false);
    setRoomName('');
  };

  const handleJoin = (roomId: string) => {
    const sock = getBlackjackSocket();
    if (!sock) return;
    sock.emit(C2S.JOIN_ROOM, { roomId });
  };

  const handleRefresh = () => {
    const sock = getBlackjackSocket();
    if (sock) sock.emit(C2S.LIST_ROOMS);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Create room toggle */}
      {showCreate ? (
        <div className="flex flex-col gap-2 p-3 rounded-lg bg-site-surface border border-site-border">
          <input
            type="text"
            placeholder="Room name (optional)"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            maxLength={30}
            className="w-full bg-site-bg border border-site-border rounded-lg px-3 py-2 text-site-text text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500/50"
          />
          <div className="flex items-center gap-2">
            <label className="text-xs text-site-text-dim">Max players:</label>
            <select
              value={maxPlayers}
              onChange={(e) => setMaxPlayers(Number(e.target.value))}
              className="bg-site-bg border border-site-border rounded px-2 py-1 text-site-text text-sm"
            >
              {[2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleCreate}
              className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-black font-bold rounded-lg text-sm"
            >
              Create
            </Button>
            <Button
              onClick={() => setShowCreate(false)}
              variant="outline"
              className="flex-1 rounded-lg text-sm"
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button
            onClick={() => setShowCreate(true)}
            className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-black font-bold rounded-lg text-sm"
          >
            <Plus className="w-4 h-4 mr-1" />
            Create Room
          </Button>
          <button
            onClick={handleRefresh}
            className="p-2 rounded-lg border border-site-border bg-site-surface text-site-text-dim hover:text-site-text transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Room list */}
      {roomList.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-site-text-dim">No rooms yet. Create one to start playing!</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {roomList.map((room) => (
            <button
              key={room.roomId}
              onClick={() => handleJoin(room.roomId)}
              disabled={room.playerCount >= room.maxPlayers}
              className="flex items-center justify-between p-3 rounded-lg bg-site-surface border border-site-border hover:bg-site-surface-hover transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-bold text-site-text">{room.name}</span>
                <span className="text-xs text-site-text-dim">
                  hosted by {room.ownerName}
                  {room.inProgress && (
                    <span className="ml-1.5 text-yellow-500">In progress</span>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-site-text-dim" />
                <span className={`text-sm font-bold ${
                  room.playerCount >= room.maxPlayers ? 'text-red-400' : 'text-site-text'
                }`}>
                  {room.playerCount}/{room.maxPlayers}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
