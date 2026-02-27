/**
 * RMH Study Room Page
 *
 * Handles the study session: timer, members, tasks, chat.
 * Mobile: tabbed layout (Session / Members / Chat).
 * Desktop: sidebar layout with Members + Chat on the right.
 */

'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Crown, Copy, Play, Pause, SkipForward, RotateCcw, Plus, Check, Trash2, Circle, UserX, Ban, Globe, GlobeLock, MessageCircle, Users, Timer, Settings, Info, X } from 'lucide-react';
import { connectToRmhStudy, emit, getSocket } from '@/lib/rmhstudy/socket';
import { useRmhStudyStore } from '@/lib/rmhstudy/store';
import { C2S } from '@/lib/rmhstudy/events';
import { toast } from '@/lib/rmhstudy/toast-store';
import RmhStudyHeader from '@/components/rmhstudy/RmhStudyHeader';
import BanListModal from '@/components/rmhstudy/BanListModal';
import ChatPanel from '@/components/shared/ChatPanel';
import type { ChatPanelMessage } from '@/components/shared/ChatPanel';
import type { TimerPhase } from '@/lib/rmhstudy/types';

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function phaseLabel(phase: TimerPhase): string {
  switch (phase) {
    case 'idle': return 'Ready';
    case 'working': return 'Focus Time';
    case 'short_break': return 'Short Break';
    case 'long_break': return 'Long Break';
    default: return phase;
  }
}

function phaseColor(phase: TimerPhase): string {
  switch (phase) {
    case 'working': return 'text-(--rmhstudy-work)';
    case 'short_break': return 'text-(--rmhstudy-break)';
    case 'long_break': return 'text-(--rmhstudy-long-break)';
    default: return 'text-(--rmhstudy-text-muted)';
  }
}

type MobileTab = 'session' | 'members' | 'chat';

export default function RmhStudyRoom() {
  const params = useParams();
  const router = useRouter();
  const roomCode = (params.roomId as string)?.toUpperCase();
  const room = useRmhStudyStore((s) => s.room);
  const tasks = useRmhStudyStore((s) => s.tasks);
  const connectionStatus = useRmhStudyStore((s) => s.connectionStatus);
  const lastPhaseComplete = useRmhStudyStore((s) => s.lastPhaseComplete);

  const [newTask, setNewTask] = useState('');
  const [mobileTab, setMobileTab] = useState<MobileTab>('session');
  const [unreadChat, setUnreadChat] = useState(0);
  const prevChatLenRef = useRef(0);

  const [showSettings, setShowSettings] = useState(false);

  // Moderation state
  const [banTarget, setBanTarget] = useState<{ userId: string; userName: string } | null>(null);
  const [banReason, setBanReason] = useState('');
  const [showBanList, setShowBanList] = useState(false);

  // Connect and join (roomCode passed to connect so the socket's connect handler auto-joins)
  useEffect(() => {
    let mounted = true;
    async function init() {
      try {
        await connectToRmhStudy(roomCode);
      } catch (err) {
        if (mounted) toast.error(err instanceof Error ? err.message : 'Connection failed');
      }
    }
    if (roomCode) init();
    return () => { mounted = false; };
  }, [roomCode]);

  // Redirect to landing page when kicked (room becomes null)
  const prevRoomRef = useRef(room);
  useEffect(() => {
    if (prevRoomRef.current && !room) {
      router.push('/rmhstudy');
    }
    prevRoomRef.current = room;
  }, [room, router]);

  // Clear phase complete notification
  useEffect(() => {
    if (lastPhaseComplete) {
      const timer = setTimeout(() => {
        useRmhStudyStore.getState().clearPhaseComplete();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [lastPhaseComplete]);

  // Track unread chat messages when not on chat tab (mobile)
  useEffect(() => {
    if (!room) return;
    const chatLen = room.chat.length;
    if (mobileTab !== 'chat' && chatLen > prevChatLenRef.current && prevChatLenRef.current > 0) {
      setUnreadChat((prev) => prev + (chatLen - prevChatLenRef.current));
    }
    if (mobileTab === 'chat') {
      setUnreadChat(0);
    }
    prevChatLenRef.current = chatLen;
  }, [room?.chat.length, mobileTab, room]);

  const handleLeave = useCallback(() => {
    emit(C2S.ROOM_LEAVE, { roomCode });
    useRmhStudyStore.getState().leaveRoom();
    router.push('/rmhstudy');
  }, [roomCode, router]);

  const handleCopyCode = useCallback(() => {
    const url = `${window.location.origin}/rmhstudy/${roomCode}`;
    navigator.clipboard.writeText(url);
    toast.info('Invite link copied!');
  }, [roomCode]);

  const handleSendChat = useCallback((message: string) => {
    emit(C2S.ROOM_CHAT, { roomCode, message });
  }, [roomCode]);

  const handleReact = useCallback((messageId: string, emoji: string) => {
    emit(C2S.CHAT_REACT, { messageId, emoji });
  }, []);

  const handleKick = useCallback((targetUserId: string) => {
    emit(C2S.ROOM_KICK, { roomCode, targetUserId });
  }, [roomCode]);

  const handleBanConfirm = useCallback(() => {
    if (!banTarget) return;
    emit(C2S.ROOM_BAN, { roomCode, targetUserId: banTarget.userId, reason: banReason.trim() || undefined });
    setBanTarget(null);
    setBanReason('');
  }, [banTarget, banReason, roomCode]);

  const handleTogglePublic = useCallback(() => {
    if (!room) return;
    emit(C2S.ROOM_SETTINGS, { roomCode, settings: { isPublic: !room.isPublic } });
  }, [room, roomCode]);

  const handleUpdateSetting = useCallback((key: string, value: number | boolean) => {
    if (!room) return;
    emit(C2S.ROOM_SETTINGS, { roomCode, settings: { ...room.settings, [key]: value } });
  }, [room, roomCode]);

  const handleAddTask = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.trim()) return;
    emit(C2S.TASK_ADD, { roomCode, text: newTask.trim() });
    setNewTask('');
  }, [newTask, roomCode]);

  if (!room) {
    return (
      <div className="flex h-screen flex-col">
        <RmhStudyHeader backLabel="Back" backHref="/rmhstudy" />
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-pulse text-(--rmhstudy-text-muted)">
            {connectionStatus === 'connecting' ? 'Connecting...' : 'Joining room...'}
          </div>
        </div>
      </div>
    );
  }

  const isHost = room.hostUserId === room.myUserId;
  const timer = room.timer;

  // ─── Shared UI Sections ─────────────────────────────────────────

  const timerAndTasks = (
    <div className="space-y-6">
      {/* Timer */}
      <div className="rounded-xl border border-(--rmhstudy-border) bg-(--rmhstudy-surface) p-8 text-center">
        <div className={`text-sm font-medium uppercase tracking-wider mb-2 ${phaseColor(timer.phase)}`}>
          {phaseLabel(timer.phase)}
        </div>

        <div className={`text-7xl font-bold font-mono tracking-tight ${phaseColor(timer.phase)}`}>
          {timer.phase === 'idle' ? formatTime(room.settings.workDurationMs) : formatTime(timer.remainingMs)}
        </div>

        <div className="text-sm mt-2 text-(--rmhstudy-text-muted)">
          Session {timer.sessionNumber} of {timer.totalSessions}
        </div>

        {/* Progress ring */}
        {timer.phase !== 'idle' && timer.totalMs > 0 && (
          <div className="mt-4 h-2 rounded-full bg-(--rmhstudy-bg) overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{
                width: `${((timer.totalMs - timer.remainingMs) / timer.totalMs) * 100}%`,
                backgroundColor: timer.phase === 'working'
                  ? 'var(--rmhstudy-work)'
                  : timer.phase === 'short_break'
                    ? 'var(--rmhstudy-break)'
                    : 'var(--rmhstudy-long-break)',
              }}
            />
          </div>
        )}

        {/* Host controls */}
        {isHost && (
          <div className="flex items-center justify-center gap-3 mt-6">
            {timer.phase === 'idle' && (
              <button
                onClick={() => emit(C2S.TIMER_START, { roomCode })}
                className="flex items-center gap-2 px-6 py-2.5 rounded-lg font-semibold text-white transition-colors bg-(--rmhstudy-accent) hover:bg-(--rmhstudy-accent-hover)"
              >
                <Play className="h-4 w-4" />
                Start
              </button>
            )}
            {timer.phase !== 'idle' && !timer.isPaused && (
              <button
                onClick={() => emit(C2S.TIMER_PAUSE, { roomCode })}
                className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors bg-(--rmhstudy-surface-hover) text-(--rmhstudy-text) hover:bg-(--rmhstudy-surface-active)"
              >
                <Pause className="h-4 w-4" />
                Pause
              </button>
            )}
            {timer.isPaused && (
              <button
                onClick={() => emit(C2S.TIMER_RESUME, { roomCode })}
                className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-white transition-colors bg-(--rmhstudy-accent) hover:bg-(--rmhstudy-accent-hover)"
              >
                <Play className="h-4 w-4" />
                Resume
              </button>
            )}
            {timer.phase !== 'idle' && (
              <>
                <button
                  onClick={() => emit(C2S.TIMER_SKIP, { roomCode })}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors bg-(--rmhstudy-surface-hover) text-(--rmhstudy-text) hover:bg-(--rmhstudy-surface-active)"
                >
                  <SkipForward className="h-4 w-4" />
                  Skip
                </button>
                <button
                  onClick={() => emit(C2S.TIMER_RESET, { roomCode })}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors bg-(--rmhstudy-danger-dim) text-(--rmhstudy-danger) hover:bg-(--rmhstudy-danger) hover:text-white"
                >
                  <RotateCcw className="h-4 w-4" />
                  Reset
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Tasks */}
      <div className="rounded-xl border border-(--rmhstudy-border) bg-(--rmhstudy-surface) p-4">
        <h3 className="text-sm font-semibold mb-3">My Tasks</h3>
        <form onSubmit={handleAddTask} className="flex gap-2 mb-3">
          <input
            type="text"
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            maxLength={200}
            placeholder="Add a task..."
            className="flex-1 px-3 py-2 rounded-lg text-sm border border-(--rmhstudy-border) bg-(--rmhstudy-bg) text-(--rmhstudy-text) placeholder:text-(--rmhstudy-text-dim) outline-none focus:ring-1 focus:ring-(--rmhstudy-accent)"
          />
          <button type="submit" className="p-2 rounded-lg bg-(--rmhstudy-accent) text-white hover:bg-(--rmhstudy-accent-hover)">
            <Plus className="h-4 w-4" />
          </button>
        </form>
        {tasks.length === 0 ? (
          <p className="text-xs text-(--rmhstudy-text-dim) text-center py-2">No tasks yet</p>
        ) : (
          <div className="space-y-1">
            {tasks.map((task) => (
              <div key={task.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-(--rmhstudy-bg) group">
                <button
                  onClick={() => emit(C2S.TASK_TOGGLE, { roomCode, taskId: task.id })}
                  className={`shrink-0 h-5 w-5 rounded border-2 flex items-center justify-center transition-colors ${
                    task.completed
                      ? 'bg-(--rmhstudy-success) border-(--rmhstudy-success) text-white'
                      : 'border-(--rmhstudy-border-bright) hover:border-(--rmhstudy-accent)'
                  }`}
                >
                  {task.completed && <Check className="h-3 w-3" />}
                </button>
                <span className={`flex-1 text-sm ${task.completed ? 'line-through text-(--rmhstudy-text-dim)' : ''}`}>
                  {task.text}
                </span>
                <button
                  onClick={() => emit(C2S.TASK_DELETE, { roomCode, taskId: task.id })}
                  className="shrink-0 p-1 rounded text-(--rmhstudy-text-dim) opacity-0 group-hover:opacity-100 hover:text-(--rmhstudy-danger)"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const membersSection = (
    <div className="p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-(--rmhstudy-text-muted)">
          Members ({room.members.length})
        </h3>
        <div className="flex items-center gap-1.5">
          {isHost && (
            <button
              onClick={handleTogglePublic}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors bg-(--rmhstudy-bg) text-(--rmhstudy-text-muted) hover:text-(--rmhstudy-text)"
            >
              {room.isPublic ? <Globe className="h-3 w-3" /> : <GlobeLock className="h-3 w-3" />}
              {room.isPublic ? 'Public' : 'Private'}
            </button>
          )}
          <button
            onClick={handleCopyCode}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-(--rmhstudy-bg) text-(--rmhstudy-text-muted) hover:text-(--rmhstudy-text)"
          >
            <Copy className="h-3 w-3" />
            {roomCode}
          </button>
        </div>
      </div>
      <div className="space-y-1">
        {room.members.map((m) => (
          <div key={m.userId} className="flex items-center gap-2 py-1 group/member">
            <Circle className={`h-2 w-2 fill-current shrink-0 ${
              m.status === 'studying' ? 'text-(--rmhstudy-work)' :
              m.status === 'break' ? 'text-(--rmhstudy-break)' :
              m.status === 'away' ? 'text-(--rmhstudy-text-dim)' :
              'text-(--rmhstudy-text-muted)'
            }`} />
            <span className="text-sm truncate">{m.userName}</span>
            {m.isHost && <Crown className="h-3 w-3 shrink-0 text-(--rmhstudy-accent)" />}
            {m.tasksTotal > 0 && (
              <span className="text-xs ml-auto text-(--rmhstudy-text-dim)">
                {m.tasksCompleted}/{m.tasksTotal}
              </span>
            )}
            {isHost && m.userId !== room.myUserId && (
              <div className="flex gap-0.5 ml-auto opacity-0 group-hover/member:opacity-100">
                <button
                  onClick={() => handleKick(m.userId)}
                  className="rounded p-0.5 text-(--rmhstudy-text-dim) hover:text-(--rmhstudy-danger) transition-colors"
                  title="Kick"
                >
                  <UserX className="h-3 w-3" />
                </button>
                <button
                  onClick={() => setBanTarget({ userId: m.userId, userName: m.userName })}
                  className="rounded p-0.5 text-(--rmhstudy-text-dim) hover:text-(--rmhstudy-danger) transition-colors"
                  title="Ban"
                >
                  <Ban className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Host controls: ban list */}
      {isHost && room.bannedUsers.length > 0 && (
        <div className="mt-3 flex items-center justify-end">
          <button
            onClick={() => setShowBanList(true)}
            className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg transition-colors bg-(--rmhstudy-bg) text-(--rmhstudy-text-muted) hover:text-(--rmhstudy-text)"
          >
            <Ban className="h-3 w-3" />
            {room.bannedUsers.length} banned
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-screen flex-col">
      <RmhStudyHeader
        backLabel="Leave"
        onBack={handleLeave}
        roomCode={roomCode}
        onCopyCode={handleCopyCode}
        leftActions={
          <button
            onClick={() => setShowSettings(true)}
            className="p-1.5 rounded-lg transition-colors text-(--rmhstudy-text-muted) hover:text-(--rmhstudy-text) hover:bg-(--rmhstudy-surface-hover)"
            title={isHost ? 'Room Settings' : 'Room Info'}
          >
            {isHost ? <Settings className="h-4 w-4" /> : <Info className="h-4 w-4" />}
          </button>
        }
      />

      {/* ─── Desktop Layout ─────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden hidden md:flex md:flex-row">
        {/* Main content — Timer + Tasks */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6" style={{ scrollbarGutter: 'stable' }}>
          <div className="max-w-2xl mx-auto">
            {timerAndTasks}
          </div>
        </div>

        {/* Sidebar — Members + Chat */}
        <div className="w-80 border-l border-(--rmhstudy-border) flex flex-col bg-(--rmhstudy-bg-subtle)">
          <div className="border-b border-(--rmhstudy-border)">
            {membersSection}
          </div>
          <ChatPanel
            messages={room.chat as ChatPanelMessage[]}
            onSendMessage={handleSendChat}
            onReact={handleReact}
            myUserId={room.myUserId}
            hostUserId={room.hostUserId}
            themePrefix="rmhstudy"
            showReactions
            showMediaEmbeds
            className="flex-1"
          />
        </div>
      </div>

      {/* ─── Mobile Layout (tabbed) ─────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex flex-col md:hidden">
        {/* Tab content */}
        <div className="flex-1 overflow-y-auto">
          {mobileTab === 'session' && (
            <div className="p-4">
              {timerAndTasks}
            </div>
          )}
          {mobileTab === 'members' && membersSection}
          {mobileTab === 'chat' && (
            <ChatPanel
              messages={room.chat as ChatPanelMessage[]}
              onSendMessage={handleSendChat}
              onReact={handleReact}
              myUserId={room.myUserId}
              hostUserId={room.hostUserId}
              themePrefix="rmhstudy"
              showReactions
              showMediaEmbeds
              className="h-full"
            />
          )}
        </div>

        {/* Tab bar */}
        <div className="shrink-0 flex border-t border-(--rmhstudy-border) bg-(--rmhstudy-surface)">
          <button
            onClick={() => setMobileTab('session')}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors ${
              mobileTab === 'session' ? 'text-(--rmhstudy-accent)' : 'text-(--rmhstudy-text-muted)'
            }`}
          >
            <Timer className="h-4 w-4" />
            Session
          </button>
          <button
            onClick={() => setMobileTab('members')}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors ${
              mobileTab === 'members' ? 'text-(--rmhstudy-accent)' : 'text-(--rmhstudy-text-muted)'
            }`}
          >
            <Users className="h-4 w-4" />
            Members
          </button>
          <button
            onClick={() => { setMobileTab('chat'); setUnreadChat(0); }}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors relative ${
              mobileTab === 'chat' ? 'text-(--rmhstudy-accent)' : 'text-(--rmhstudy-text-muted)'
            }`}
          >
            <MessageCircle className="h-4 w-4" />
            Chat
            {unreadChat > 0 && (
              <span className="absolute top-1.5 right-1/4 h-4 min-w-4 px-1 flex items-center justify-center rounded-full bg-(--rmhstudy-accent) text-white text-[10px] font-bold">
                {unreadChat > 9 ? '9+' : unreadChat}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Settings modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowSettings(false)} />
          <div className="relative w-full max-w-md rounded-xl border border-(--rmhstudy-border) bg-(--rmhstudy-surface) p-6 shadow-xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                {isHost ? <Settings className="h-5 w-5 text-(--rmhstudy-accent)" /> : <Info className="h-5 w-5 text-(--rmhstudy-accent)" />}
                {isHost ? 'Room Settings' : 'Room Info'}
              </h3>
              <button
                onClick={() => setShowSettings(false)}
                className="p-1 rounded-lg text-(--rmhstudy-text-muted) hover:text-(--rmhstudy-text) transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {isHost && timer.phase !== 'idle' && (
              <p className="text-xs text-(--rmhstudy-warning) mb-4">
                Settings can only be changed while the timer is idle.
              </p>
            )}

            <div className="space-y-5">
              {/* Work Duration */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-(--rmhstudy-text-muted)">Focus Duration</label>
                  <span className="text-sm font-mono font-bold text-(--rmhstudy-text)">{Math.round(room.settings.workDurationMs / 60000)} min</span>
                </div>
                {isHost && timer.phase === 'idle' ? (
                  <div className="flex gap-1.5">
                    {[15, 25, 30, 45, 60, 90].map((m) => (
                      <button
                        key={m}
                        onClick={() => handleUpdateSetting('workDurationMs', m * 60000)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          Math.round(room.settings.workDurationMs / 60000) === m
                            ? 'bg-(--rmhstudy-accent) text-white'
                            : 'bg-(--rmhstudy-bg) text-(--rmhstudy-text-muted) hover:bg-(--rmhstudy-surface-hover)'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="h-8 flex items-center px-3 rounded-lg bg-(--rmhstudy-bg) text-sm text-(--rmhstudy-text-muted)">
                    {Math.round(room.settings.workDurationMs / 60000)} minutes
                  </div>
                )}
              </div>

              {/* Short Break */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-(--rmhstudy-text-muted)">Short Break</label>
                  <span className="text-sm font-mono font-bold text-(--rmhstudy-text)">{Math.round(room.settings.shortBreakMs / 60000)} min</span>
                </div>
                {isHost && timer.phase === 'idle' ? (
                  <div className="flex gap-1.5">
                    {[3, 5, 10, 15].map((m) => (
                      <button
                        key={m}
                        onClick={() => handleUpdateSetting('shortBreakMs', m * 60000)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          Math.round(room.settings.shortBreakMs / 60000) === m
                            ? 'bg-(--rmhstudy-accent) text-white'
                            : 'bg-(--rmhstudy-bg) text-(--rmhstudy-text-muted) hover:bg-(--rmhstudy-surface-hover)'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="h-8 flex items-center px-3 rounded-lg bg-(--rmhstudy-bg) text-sm text-(--rmhstudy-text-muted)">
                    {Math.round(room.settings.shortBreakMs / 60000)} minutes
                  </div>
                )}
              </div>

              {/* Long Break */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-(--rmhstudy-text-muted)">Long Break</label>
                  <span className="text-sm font-mono font-bold text-(--rmhstudy-text)">{Math.round(room.settings.longBreakMs / 60000)} min</span>
                </div>
                {isHost && timer.phase === 'idle' ? (
                  <div className="flex gap-1.5">
                    {[10, 15, 20, 30].map((m) => (
                      <button
                        key={m}
                        onClick={() => handleUpdateSetting('longBreakMs', m * 60000)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          Math.round(room.settings.longBreakMs / 60000) === m
                            ? 'bg-(--rmhstudy-accent) text-white'
                            : 'bg-(--rmhstudy-bg) text-(--rmhstudy-text-muted) hover:bg-(--rmhstudy-surface-hover)'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="h-8 flex items-center px-3 rounded-lg bg-(--rmhstudy-bg) text-sm text-(--rmhstudy-text-muted)">
                    {Math.round(room.settings.longBreakMs / 60000)} minutes
                  </div>
                )}
              </div>

              {/* Sessions before long break */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-(--rmhstudy-text-muted)">Sessions before long break</label>
                  <span className="text-sm font-mono font-bold text-(--rmhstudy-text)">{room.settings.sessionsBeforeLongBreak}</span>
                </div>
                {isHost && timer.phase === 'idle' ? (
                  <input
                    type="range"
                    min={1}
                    max={12}
                    value={room.settings.sessionsBeforeLongBreak}
                    onChange={(e) => handleUpdateSetting('sessionsBeforeLongBreak', Number(e.target.value))}
                    className="w-full accent-(--rmhstudy-accent)"
                  />
                ) : (
                  <div className="h-8 flex items-center px-3 rounded-lg bg-(--rmhstudy-bg) text-sm text-(--rmhstudy-text-muted)">
                    {room.settings.sessionsBeforeLongBreak} sessions
                  </div>
                )}
              </div>

              {/* Auto-start toggles */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-(--rmhstudy-text-muted)">Auto-start breaks</label>
                  {isHost && timer.phase === 'idle' ? (
                    <button
                      onClick={() => handleUpdateSetting('autoStartBreaks', !room.settings.autoStartBreaks)}
                      className={`relative w-10 h-5.5 rounded-full transition-colors ${
                        room.settings.autoStartBreaks ? 'bg-(--rmhstudy-accent)' : 'bg-(--rmhstudy-border-bright)'
                      }`}
                    >
                      <span className={`absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white transition-transform ${
                        room.settings.autoStartBreaks ? 'translate-x-5' : 'translate-x-0.5'
                      }`} />
                    </button>
                  ) : (
                    <span className="text-sm text-(--rmhstudy-text)">{room.settings.autoStartBreaks ? 'On' : 'Off'}</span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-(--rmhstudy-text-muted)">Auto-start work sessions</label>
                  {isHost && timer.phase === 'idle' ? (
                    <button
                      onClick={() => handleUpdateSetting('autoStartWork', !room.settings.autoStartWork)}
                      className={`relative w-10 h-5.5 rounded-full transition-colors ${
                        room.settings.autoStartWork ? 'bg-(--rmhstudy-accent)' : 'bg-(--rmhstudy-border-bright)'
                      }`}
                    >
                      <span className={`absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white transition-transform ${
                        room.settings.autoStartWork ? 'translate-x-5' : 'translate-x-0.5'
                      }`} />
                    </button>
                  ) : (
                    <span className="text-sm text-(--rmhstudy-text)">{room.settings.autoStartWork ? 'On' : 'Off'}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Ban confirm dialog */}
      {banTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => { setBanTarget(null); setBanReason(''); }} />
          <div className="relative w-full max-w-sm rounded-xl border border-(--rmhstudy-border) bg-(--rmhstudy-surface) p-6 shadow-xl">
            <h3 className="text-lg font-semibold mb-2">Ban {banTarget.userName}?</h3>
            <p className="text-sm text-(--rmhstudy-text-muted) mb-4">
              This member will be removed and cannot rejoin this room.
            </p>
            <input
              type="text"
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              placeholder="Reason (optional)"
              maxLength={200}
              className="w-full px-3 py-2 rounded-lg text-sm border border-(--rmhstudy-border) bg-(--rmhstudy-bg) text-(--rmhstudy-text) placeholder:text-(--rmhstudy-text-dim) outline-none focus:ring-1 focus:ring-(--rmhstudy-accent) mb-4"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setBanTarget(null); setBanReason(''); }}
                className="flex-1 py-2 rounded-lg font-medium text-sm transition-colors bg-(--rmhstudy-bg) text-(--rmhstudy-text-muted) hover:text-(--rmhstudy-text)"
              >
                Cancel
              </button>
              <button
                onClick={handleBanConfirm}
                className="flex-1 py-2 rounded-lg font-medium text-sm text-white transition-colors bg-(--rmhstudy-danger) hover:opacity-90"
              >
                Ban
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ban list modal */}
      {showBanList && <BanListModal onClose={() => setShowBanList(false)} />}
    </div>
  );
}
