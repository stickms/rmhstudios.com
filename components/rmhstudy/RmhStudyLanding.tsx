/**
 * RMH Study Landing Page
 *
 * Create or join a study room with synced Pomodoro timers.
 */

import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, Clock, Users, Globe, RefreshCw, Layers, ArrowRight } from 'lucide-react';
import { connectToRmhStudy, getSocket, disconnectFromRmhStudy, emit } from '@/lib/rmhstudy/socket';
import { useRmhStudyStore } from '@/lib/rmhstudy/store';
import { C2S, S2C } from '@/lib/rmhstudy/events';
import { toast } from '@/lib/rmhstudy/toast-store';
import RmhStudyHeader from '@/components/rmhstudy/RmhStudyHeader';
import type { PublicStudyRoomInfo } from '@/lib/rmhstudy/types';
import { useRouter } from '@tanstack/react-router';

export default function RmhStudyLanding() {
  const { t } = useTranslation("c-rmhstudy");
  const router = useRouter();
  const connectionStatus = useRmhStudyStore((s) => s.connectionStatus);
  const [joinCode, setJoinCode] = useState('');
  const [publicRooms, setPublicRooms] = useState<PublicStudyRoomInfo[]>([]);
  const [workMinutes, setWorkMinutes] = useState(25);
  const [shortBreakMinutes, setShortBreakMinutes] = useState(5);
  const [longBreakMinutes, setLongBreakMinutes] = useState(15);
  const [sessions, setSessions] = useState(4);

  useEffect(() => {
    let mounted = true;

    function onRoomState(data: { roomCode: string }) {
      if (mounted && data.roomCode) {
        router.navigate({ to: `/rmhstudy/${data.roomCode}` });
      }
    }

    async function connect() {
      try {
        const socket = await connectToRmhStudy();

        const existingRoom = useRmhStudyStore.getState().room;
        if (existingRoom && mounted) {
          router.navigate({ to: `/rmhstudy/${existingRoom.roomCode}` });
          return;
        }

        socket.on(S2C.ROOM_STATE, onRoomState);

        // Browse public rooms
        socket.on(S2C.ROOM_BROWSE_RESULT, (data: { rooms: PublicStudyRoomInfo[] }) => {
          if (mounted) setPublicRooms(data.rooms ?? []);
        });

        emit(C2S.ROOM_BROWSE, {});
      } catch (err) {
        if (mounted) toast.error(err instanceof Error ? err.message : t("connection-failed", { defaultValue: "Connection failed" }));
      }
    }

    connect();

    // Refresh public rooms every 10 seconds
    const browseInterval = setInterval(() => {
      if (mounted) emit(C2S.ROOM_BROWSE, {});
    }, 10_000);

    return () => {
      mounted = false;
      clearInterval(browseInterval);
      // Clean up the listener so it doesn't fire after navigation
      getSocket()?.off(S2C.ROOM_STATE, onRoomState);
    };
  }, [router]);

  useEffect(() => {
    return () => {
      const socket = getSocket();
      if (socket && !socket.connected && !socket.active) {
        disconnectFromRmhStudy();
      }
    };
  }, []);

  const handleCreateRoom = useCallback(() => {
    emit(C2S.ROOM_CREATE, {
      settings: {
        workDurationMs: workMinutes * 60 * 1000,
        shortBreakMs: shortBreakMinutes * 60 * 1000,
        longBreakMs: longBreakMinutes * 60 * 1000,
        sessionsBeforeLongBreak: sessions,
        autoStartBreaks: true,
        autoStartWork: false,
      },
    });
  }, [workMinutes, shortBreakMinutes, longBreakMinutes, sessions]);

  const handleJoinRoom = useCallback(() => {
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 6) {
      toast.warning(t("room-code-length", { defaultValue: "Room code must be 6 characters" }));
      return;
    }
    emit(C2S.ROOM_JOIN, { roomCode: code });
  }, [joinCode]);

  return (
    <div className="flex h-screen flex-col">
      <RmhStudyHeader backLabel="Builds" backHref="/builds" />

      <div className="flex-1 overflow-y-auto p-4 md:p-8" style={{ scrollbarGutter: 'stable both-edges' }}>
        <div className="max-w-4xl mx-auto space-y-8">

          {/* Hero */}
          <div className="text-center py-8">
            <div className="inline-flex items-center gap-2 mb-4">
              <BookOpen className="h-8 w-8 text-(--rmhstudy-accent)" />
              <h2 className="text-3xl font-bold">RMH Study</h2>
            </div>
            <p className="text-(--rmhstudy-text-muted) max-w-md mx-auto">
              {t("hero-subtitle", { defaultValue: "Study together with synced Pomodoro timers. Create a room, invite friends, and stay focused." })}
            </p>
          </div>

          {/* Flashcards — solo study with decks + AI tutor */}
          <button
            onClick={() => router.navigate({ to: '/study' })}
            className="group w-full flex items-center gap-4 rounded-xl border border-(--rmhstudy-border) bg-(--rmhstudy-surface) p-5 text-left transition-colors hover:border-(--rmhstudy-accent)"
          >
            <div className="rounded-lg p-3 bg-(--rmhstudy-bg)">
              <Layers className="h-6 w-6 text-(--rmhstudy-accent)" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold flex items-center gap-2">{t("flashcards", { defaultValue: "Flashcards" })}</h3>
              <p className="text-sm text-(--rmhstudy-text-muted)">
                {t("flashcards-subtitle", { defaultValue: "Drill solo with flashcard decks and an AI tutor — spaced repetition, your pace." })}
              </p>
            </div>
            <ArrowRight className="h-5 w-5 shrink-0 text-(--rmhstudy-text-muted) transition-transform group-hover:translate-x-1" />
          </button>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Create Room */}
            <div className="rounded-xl border border-(--rmhstudy-border) bg-(--rmhstudy-surface) p-6">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Clock className="h-5 w-5 text-(--rmhstudy-accent)" />
                {t("create-study-room", { defaultValue: "Create Study Room" })}
              </h2>

              <div className="space-y-3 mb-4">
                <div>
                  <label className="block text-xs font-medium mb-1 text-(--rmhstudy-text-muted)">
                    {t("work-duration", { defaultValue: "Work Duration: {{minutes}} min", minutes: workMinutes })}
                  </label>
                  <input
                    type="range"
                    min={5}
                    max={120}
                    step={5}
                    value={workMinutes}
                    onChange={(e) => setWorkMinutes(Number(e.target.value))}
                    className="w-full accent-(--rmhstudy-accent)"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1 text-(--rmhstudy-text-muted)">
                      {t("short-break", { defaultValue: "Short Break: {{minutes}} min", minutes: shortBreakMinutes })}
                    </label>
                    <input
                      type="range"
                      min={1}
                      max={30}
                      value={shortBreakMinutes}
                      onChange={(e) => setShortBreakMinutes(Number(e.target.value))}
                      className="w-full accent-(--rmhstudy-accent)"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1 text-(--rmhstudy-text-muted)">
                      {t("long-break", { defaultValue: "Long Break: {{minutes}} min", minutes: longBreakMinutes })}
                    </label>
                    <input
                      type="range"
                      min={5}
                      max={60}
                      step={5}
                      value={longBreakMinutes}
                      onChange={(e) => setLongBreakMinutes(Number(e.target.value))}
                      className="w-full accent-(--rmhstudy-accent)"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1 text-(--rmhstudy-text-muted)">
                    {t("sessions-before-long-break", { defaultValue: "Sessions before long break: {{sessions}}", sessions })}
                  </label>
                  <input
                    type="range"
                    min={2}
                    max={8}
                    value={sessions}
                    onChange={(e) => setSessions(Number(e.target.value))}
                    className="w-full accent-(--rmhstudy-accent)"
                  />
                </div>
              </div>

              <button
                onClick={handleCreateRoom}
                disabled={connectionStatus !== 'connected'}
                className="w-full py-3 rounded-lg font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-(--rmhstudy-accent) hover:bg-(--rmhstudy-accent-hover)"
              >
                {t("create-room", { defaultValue: "Create Room" })}
              </button>
            </div>

            {/* Join Room */}
            <div className="rounded-xl border border-(--rmhstudy-border) bg-(--rmhstudy-surface) p-6">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Users className="h-5 w-5 text-(--rmhstudy-accent)" />
                {t("join-study-room", { defaultValue: "Join Study Room" })}
              </h2>
              <p className="text-sm mb-4 text-(--rmhstudy-text-muted)">
                {t("join-description", { defaultValue: "Enter a 6-character room code to join a friend's study session." })}
              </p>
              <form onSubmit={(e) => { e.preventDefault(); handleJoinRoom(); }} className="flex gap-2">
                <input
                  type="text"
                  maxLength={6}
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="ABCDEF"
                  className="w-10 min-w-0 flex-1 px-4 py-3 rounded-lg font-mono text-lg uppercase tracking-widest text-center border border-(--rmhstudy-border) bg-(--rmhstudy-bg) text-(--rmhstudy-text) placeholder:text-(--rmhstudy-text-dim) outline-none focus:ring-1 focus:ring-(--rmhstudy-accent)"
                />
                <button
                  type="submit"
                  disabled={connectionStatus !== 'connected' || joinCode.trim().length !== 6}
                  className="px-6 py-3 rounded-lg font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-(--rmhstudy-accent) hover:bg-(--rmhstudy-accent-hover)"
                >
                  {t("join", { defaultValue: "Join" })}
                </button>
              </form>

              <div className="mt-6 p-4 rounded-lg bg-(--rmhstudy-bg) border border-(--rmhstudy-border)">
                <h3 className="text-sm font-semibold mb-2">{t("how-it-works", { defaultValue: "How it works" })}</h3>
                <ul className="text-xs space-y-1 text-(--rmhstudy-text-muted)">
                  <li>{t("how-step-1", { defaultValue: "1. Create or join a study room" })}</li>
                  <li>{t("how-step-2", { defaultValue: "2. The host starts the Pomodoro timer" })}</li>
                  <li>{t("how-step-3", { defaultValue: "3. Everyone studies during focus periods" })}</li>
                  <li>{t("how-step-4", { defaultValue: "4. Take synced breaks together" })}</li>
                  <li>{t("how-step-5", { defaultValue: "5. Track your focus time and streaks" })}</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Public Rooms */}
          <div className="rounded-xl border border-(--rmhstudy-border) bg-(--rmhstudy-surface) p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Globe className="h-5 w-5 text-(--rmhstudy-accent)" />
                {t("public-study-rooms", { defaultValue: "Public Study Rooms" })}
              </h2>
              <button
                onClick={() => emit(C2S.ROOM_BROWSE, {})}
                className="p-1.5 rounded-lg text-(--rmhstudy-text-muted) hover:text-(--rmhstudy-text) hover:bg-(--rmhstudy-surface-hover) transition-colors"
                title={t("refresh", { defaultValue: "Refresh" })}
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
            {publicRooms.length === 0 ? (
              <p className="text-sm text-(--rmhstudy-text-muted) text-center py-4">
                {t("no-public-rooms", { defaultValue: "No public rooms available. Create one!" })}
              </p>
            ) : (
              <div className="space-y-2">
                {publicRooms.map((r) => (
                  <button
                    key={r.roomCode}
                    onClick={() => emit(C2S.ROOM_JOIN, { roomCode: r.roomCode })}
                    className="w-full flex items-center justify-between p-3 rounded-lg bg-(--rmhstudy-bg) border border-(--rmhstudy-border) hover:border-(--rmhstudy-accent) transition-colors text-left"
                  >
                    <div>
                      <div className="font-medium text-sm">{t("hosts-room", { defaultValue: "{{host}}'s room", host: r.hostUserName })}</div>
                      <div className="text-xs text-(--rmhstudy-text-muted) mt-0.5">
                        {t("min-focus", { defaultValue: "{{minutes}} min focus", minutes: Math.round(r.workDurationMs / 60_000) })}
                        {' · '}
                        {r.timerPhase === 'idle' ? t("phase-waiting", { defaultValue: "Waiting" }) :
                         r.timerPhase === 'working' ? t("phase-focusing", { defaultValue: "Focusing" }) :
                         r.timerPhase === 'short_break' ? t("phase-short-break", { defaultValue: "Short break" }) : t("phase-long-break", { defaultValue: "Long break" })}
                      </div>
                    </div>
                    <div className="text-xs font-mono text-(--rmhstudy-text-muted)">
                      {r.memberCount}/{r.maxMembers}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
