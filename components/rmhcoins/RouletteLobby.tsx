'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Users, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { useRouletteStore } from '@/lib/roulette/store';
import { getRouletteSocket } from '@/lib/roulette/socket';
import { C2S } from '@/lib/roulette/events';

export function RouletteLobby() {
  const { t } = useTranslation("c-rmhcoins");
  const roomList = useRouletteStore((s) => s.roomList);
  const [showCreate, setShowCreate] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [roomName, setRoomName] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [privacy, setPrivacy] = useState<'public' | 'unlisted'>('public');

  // Poll room list
  useEffect(() => {
    const sock = getRouletteSocket();
    if (!sock) return;
    sock.emit(C2S.LIST_ROOMS);
    const interval = setInterval(() => sock.emit(C2S.LIST_ROOMS), 5000);
    return () => clearInterval(interval);
  }, []);

  const handleCreate = () => {
    const sock = getRouletteSocket();
    if (!sock) return;
    sock.emit(C2S.CREATE_ROOM, {
      name: roomName.trim() || undefined,
      maxPlayers,
      privacy,
    });
    setShowCreate(false);
    setRoomName('');
  };

  const handleJoin = (roomId: string) => {
    const sock = getRouletteSocket();
    if (!sock) return;
    sock.emit(C2S.JOIN_ROOM, { roomId });
  };

  const handleJoinByCode = () => {
    if (!joinCodeInput.trim()) return;
    const sock = getRouletteSocket();
    if (!sock) return;
    sock.emit(C2S.JOIN_ROOM, { joinCode: joinCodeInput.trim().toUpperCase() });
    setJoinCodeInput('');
  };

  const handleRefresh = () => {
    const sock = getRouletteSocket();
    if (sock) sock.emit(C2S.LIST_ROOMS);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Join by code */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder={t("join-code-placeholder", { defaultValue: "Join code..." })}
          value={joinCodeInput}
          onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
          maxLength={5}
          className="flex-1 bg-site-surface border border-site-border rounded-lg px-3 py-2 text-site-text text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-violet-500/50"
        />
        <Button
          onClick={handleJoinByCode}
          disabled={!joinCodeInput.trim()}
          className="bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-lg text-sm"
        >
          {t("join", { defaultValue: "Join" })}
        </Button>
      </div>

      {/* Create room toggle */}
      {showCreate ? (
        <div className="flex flex-col gap-2 p-3 rounded-lg bg-site-surface border border-site-border">
          <input
            type="text"
            placeholder={t("room-name-placeholder", { defaultValue: "Room name (optional)" })}
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            maxLength={30}
            className="w-full bg-site-bg border border-site-border rounded-lg px-3 py-2 text-site-text text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
          />
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-site-text-dim">{t("max-players", { defaultValue: "Max players" })}</label>
              <Select
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(Number(e.target.value))}
              >
                {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-site-text-dim">{t("privacy", { defaultValue: "Privacy" })}</label>
              <Select
                value={privacy}
                onChange={(e) => setPrivacy(e.target.value as 'public' | 'unlisted')}
              >
                <option value="public">{t("privacy-public", { defaultValue: "Public" })}</option>
                <option value="unlisted">{t("privacy-unlisted", { defaultValue: "Unlisted" })}</option>
              </Select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleCreate}
              className="flex-1 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-lg text-sm"
            >
              {t("create", { defaultValue: "Create" })}
            </Button>
            <Button
              onClick={() => setShowCreate(false)}
              variant="outline"
              className="flex-1 rounded-lg text-sm"
            >
              {t("cancel", { defaultValue: "Cancel" })}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button
            onClick={() => setShowCreate(true)}
            className="flex-1 bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-lg text-sm"
          >
            <Plus className="w-4 h-4 mr-1" />
            {t("create-room", { defaultValue: "Create Room" })}
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
          <p className="text-sm text-site-text-dim">{t("no-rooms", { defaultValue: "No rooms yet. Create one to start playing!" })}</p>
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
                  {t("hosted-by", { defaultValue: "hosted by {{ownerName}}", ownerName: room.ownerName })}
                  {room.inProgress && (
                    <span className="ml-1.5 text-violet-400">{t("in-progress", { defaultValue: "In progress" })}</span>
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
