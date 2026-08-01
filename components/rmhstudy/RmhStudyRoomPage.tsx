/**
 * RMH Study Room Page
 *
 * Handles the study session: timer, members, tasks, chat.
 * Mobile: tabbed layout (Session / Members / Chat).
 * Desktop: sidebar layout with Members + Chat on the right.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Crown, Copy, Play, Pause, SkipForward, RotateCcw, Plus, Check, Trash2, Circle, UserX, Ban, Globe, GlobeLock, MessageCircle, Users, Timer, Settings, Info, X, Layers } from 'lucide-react';
import { connectToRmhStudy, emit, getSocket } from '@/lib/rmhstudy/socket';
import { useRmhStudyStore } from '@/lib/rmhstudy/store';
import { C2S } from '@/lib/rmhstudy/events';
import { toast } from '@/lib/rmhstudy/toast-store';
import RmhStudyHeader from '@/components/rmhstudy/RmhStudyHeader';
import BanListModal from '@/components/rmhstudy/BanListModal';
import RmhStudyFlashcards from '@/components/rmhstudy/RmhStudyFlashcards';
import ChatPanel from '@/components/shared/ChatPanel';
import type { ChatPanelMessage } from '@/components/shared/ChatPanel';
import type { TimerPhase } from '@/lib/rmhstudy/types';
import { useParams, useRouter } from '@tanstack/react-router';

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function phaseLabel(phase: TimerPhase, t: (key: string, opts: { defaultValue: string }) => string): string {
  switch (phase) {
    case 'idle': return t('phase-ready', { defaultValue: 'Ready' });
    case 'working': return t('phase-focus-time', { defaultValue: 'Focus Time' });
    case 'short_break': return t('phase-short-break', { defaultValue: 'Short Break' });
    case 'long_break': return t('phase-long-break', { defaultValue: 'Long Break' });
    default: return phase;
  }
}

function phaseColor(phase: TimerPhase): string {
  switch (phase) {
    case 'working': return 'text-(--rmhstudy-work)';
    case 'short_break': return 'text-(--rmhstudy-break)';
    case 'long_break': return 'text-(--rmhstudy-long-break)';
    default: return 'text-(--app-text-muted)';
  }
}

type MobileTab = 'session' | 'flashcards' | 'members' | 'chat';

export default function RmhStudyRoom() {
  const { t } = useTranslation("c-rmhstudy");
  const { roomId } = useParams({ from: '/rmhstudy/$roomId' });
  const router = useRouter();
  const roomCode = roomId?.toUpperCase();
  const room = useRmhStudyStore((s) => s.room);
  const tasks = useRmhStudyStore((s) => s.tasks);
  const connectionStatus = useRmhStudyStore((s) => s.connectionStatus);
  const lastPhaseComplete = useRmhStudyStore((s) => s.lastPhaseComplete);

  const [newTask, setNewTask] = useState('');
  const [mobileTab, setMobileTab] = useState<MobileTab>('session');
  const [desktopView, setDesktopView] = useState<'session' | 'flashcards'>('session');
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
        if (mounted) toast.error(err instanceof Error ? err.message : t('connection-failed', { defaultValue: 'Connection failed' }));
      }
    }
    if (roomCode) init();
    return () => { mounted = false; };
  }, [roomCode]);

  // Redirect to landing page when kicked (room becomes null)
  const prevRoomRef = useRef(room);
  useEffect(() => {
    if (prevRoomRef.current && !room) {
      router.navigate({ to: '/rmhstudy' });
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
    router.navigate({ to: '/rmhstudy' });
  }, [roomCode, router]);

  const handleCopyCode = useCallback(() => {
    const url = `${window.location.origin}/rmhstudy/${roomCode}`;
    navigator.clipboard.writeText(url);
    toast.info(t('invite-link-copied', { defaultValue: 'Invite link copied!' }));
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
      <div className="app-viewport">
        <RmhStudyHeader backLabel={t('back', { defaultValue: 'Back' })} backHref="/rmhstudy" />
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-pulse text-(--app-text-muted)">
            {connectionStatus === 'connecting' ? t('connecting', { defaultValue: 'Connecting...' }) : t('joining-room', { defaultValue: 'Joining room...' })}
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
      <div className="rounded-xl border border-(--app-border) bg-(--app-surface) p-8 text-center">
        <div className={`text-sm font-medium uppercase tracking-wider mb-2 ${phaseColor(timer.phase)}`}>
          {phaseLabel(timer.phase, t)}
        </div>

        <div className={`text-7xl font-bold font-mono tracking-tight ${phaseColor(timer.phase)}`}>
          {timer.phase === 'idle' ? formatTime(room.settings.workDurationMs) : formatTime(timer.remainingMs)}
        </div>

        <div className="text-sm mt-2 text-(--app-text-muted)">
          {t('session-counter', { defaultValue: 'Session {{sessionNumber}} of {{totalSessions}}', sessionNumber: timer.sessionNumber, totalSessions: timer.totalSessions })}
        </div>

        {/* Progress ring */}
        {timer.phase !== 'idle' && timer.totalMs > 0 && (
          <div className="mt-4 h-2 rounded-full bg-(--app-bg) overflow-hidden">
            <div
              className="h-full w-full origin-left transition-[transform,background-color] duration-1000"
              style={{
                transform: `scaleX(${(((timer.totalMs - timer.remainingMs) / timer.totalMs) * 100) / 100})`,
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
                className="flex items-center gap-2 px-6 py-2.5 rounded-lg font-semibold text-(--app-accent-fg) transition-colors bg-(--app-accent) hover:bg-(--app-accent-hover)"
              >
                <Play className="h-4 w-4" />
                {t('start', { defaultValue: 'Start' })}
              </button>
            )}
            {timer.phase !== 'idle' && !timer.isPaused && (
              <button
                onClick={() => emit(C2S.TIMER_PAUSE, { roomCode })}
                className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors bg-(--app-surface-hover) text-(--app-text) hover:bg-(--app-surface-active)"
              >
                <Pause className="h-4 w-4" />
                {t('pause', { defaultValue: 'Pause' })}
              </button>
            )}
            {timer.isPaused && (
              <button
                onClick={() => emit(C2S.TIMER_RESUME, { roomCode })}
                className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-(--app-accent-fg) transition-colors bg-(--app-accent) hover:bg-(--app-accent-hover)"
              >
                <Play className="h-4 w-4" />
                {t('resume', { defaultValue: 'Resume' })}
              </button>
            )}
            {timer.phase !== 'idle' && (
              <>
                <button
                  onClick={() => emit(C2S.TIMER_SKIP, { roomCode })}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors bg-(--app-surface-hover) text-(--app-text) hover:bg-(--app-surface-active)"
                >
                  <SkipForward className="h-4 w-4" />
                  {t('skip', { defaultValue: 'Skip' })}
                </button>
                <button
                  onClick={() => emit(C2S.TIMER_RESET, { roomCode })}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors bg-(--app-danger-dim) text-(--app-danger) hover:bg-(--app-danger) hover:text-white"
                >
                  <RotateCcw className="h-4 w-4" />
                  {t('reset', { defaultValue: 'Reset' })}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Tasks */}
      <div className="rounded-xl border border-(--app-border) bg-(--app-surface) p-4">
        <h3 className="text-sm font-semibold mb-3">{t('my-tasks', { defaultValue: 'My Tasks' })}</h3>
        <form onSubmit={handleAddTask} className="flex gap-2 mb-3">
          <input
            type="text"
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            maxLength={200}
            placeholder={t('add-task-placeholder', { defaultValue: 'Add a task...' })}
            className="flex-1 px-3 py-2 rounded-lg text-sm border border-(--app-border) bg-(--app-bg) text-(--app-text) placeholder:text-(--app-text-dim) outline-none focus:ring-1 focus:ring-(--app-accent)"
          />
          <button type="submit" className="p-2 rounded-lg bg-(--app-accent) text-(--app-accent-fg) hover:bg-(--app-accent-hover)">
            <Plus className="h-4 w-4" />
          </button>
        </form>
        {tasks.length === 0 ? (
          <p className="text-xs text-(--app-text-dim) text-center py-2">{t('no-tasks-yet', { defaultValue: 'No tasks yet' })}</p>
        ) : (
          <div className="space-y-1">
            {tasks.map((task) => (
              <div key={task.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-(--app-bg) group">
                <button
                  onClick={() => emit(C2S.TASK_TOGGLE, { roomCode, taskId: task.id })}
                  className={`shrink-0 h-5 w-5 rounded border-2 flex items-center justify-center transition-colors ${
                    task.completed
                      ? 'bg-(--app-success) border-(--app-success) text-white'
                      : 'border-(--app-border-bright) hover:border-(--app-accent)'
                  }`}
                >
                  {task.completed && <Check className="h-3 w-3" />}
                </button>
                <span className={`flex-1 text-sm ${task.completed ? 'line-through text-(--app-text-dim)' : ''}`}>
                  {task.text}
                </span>
                <button
                  onClick={() => emit(C2S.TASK_DELETE, { roomCode, taskId: task.id })}
                  className="shrink-0 p-1 rounded text-(--app-text-dim) opacity-0 group-hover:opacity-100 hover:text-(--app-danger)"
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
        <h3 className="text-xs font-semibold uppercase tracking-wider text-(--app-text-muted)">
          {t('members-count', { defaultValue: 'Members ({{count}})', count: room.members.length })}
        </h3>
        <div className="flex items-center gap-1.5">
          {isHost && (
            <button
              onClick={handleTogglePublic}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors bg-(--app-bg) text-(--app-text-muted) hover:text-(--app-text)"
            >
              {room.isPublic ? <Globe className="h-3 w-3" /> : <GlobeLock className="h-3 w-3" />}
              {room.isPublic ? t('public', { defaultValue: 'Public' }) : t('private', { defaultValue: 'Private' })}
            </button>
          )}
          <button
            onClick={handleCopyCode}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-(--app-bg) text-(--app-text-muted) hover:text-(--app-text)"
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
              m.status === 'away' ? 'text-(--app-text-dim)' :
              'text-(--app-text-muted)'
            }`} />
            <span className="text-sm truncate">{m.userName}</span>
            {m.isHost && <Crown className="h-3 w-3 shrink-0 text-(--app-accent)" />}
            {m.tasksTotal > 0 && (
              <span className="text-xs ml-auto text-(--app-text-dim)">
                {m.tasksCompleted}/{m.tasksTotal}
              </span>
            )}
            {isHost && m.userId !== room.myUserId && (
              <div className="flex gap-0.5 ml-auto opacity-0 group-hover/member:opacity-100">
                <button
                  onClick={() => handleKick(m.userId)}
                  className="rounded p-0.5 text-(--app-text-dim) hover:text-(--app-danger) transition-colors"
                  title={t('kick', { defaultValue: 'Kick' })}
                >
                  <UserX className="h-3 w-3" />
                </button>
                <button
                  onClick={() => setBanTarget({ userId: m.userId, userName: m.userName })}
                  className="rounded p-0.5 text-(--app-text-dim) hover:text-(--app-danger) transition-colors"
                  title={t('ban', { defaultValue: 'Ban' })}
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
            className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg transition-colors bg-(--app-bg) text-(--app-text-muted) hover:text-(--app-text)"
          >
            <Ban className="h-3 w-3" />
            {t('banned-count', { defaultValue: '{{count}} banned', count: room.bannedUsers.length })}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="app-viewport">
      <RmhStudyHeader
        backLabel={t('leave', { defaultValue: 'Leave' })}
        onBack={handleLeave}
        roomCode={roomCode}
        onCopyCode={handleCopyCode}
        leftActions={
          <button
            onClick={() => setShowSettings(true)}
            className="p-1.5 rounded-lg transition-colors text-(--app-text-muted) hover:text-(--app-text) hover:bg-(--app-surface-hover)"
            title={isHost ? t('room-settings', { defaultValue: 'Room Settings' }) : t('room-info', { defaultValue: 'Room Info' })}
          >
            {isHost ? <Settings className="h-4 w-4" /> : <Info className="h-4 w-4" />}
          </button>
        }
      />

      {/* ─── Desktop Layout ─────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden hidden md:flex md:flex-row">
        {/* Main content — Timer + Tasks / Flashcards */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6" style={{ scrollbarGutter: 'stable' }}>
          <div className="max-w-2xl mx-auto">
            <div className="mb-4 flex gap-1 rounded-xl bg-(--app-surface) p-1 text-sm">
              {(['session', 'flashcards'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setDesktopView(v)}
                  className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 font-medium transition-colors ${
                    desktopView === v
                      ? 'bg-(--app-accent) text-(--app-accent-fg)'
                      : 'text-(--app-text-muted) hover:text-(--app-text)'
                  }`}
                >
                  {v === 'session' ? <Timer className="h-4 w-4" /> : <Layers className="h-4 w-4" />}
                  {v === 'session' ? t('tab-session', { defaultValue: 'Session' }) : t('tab-flashcards', { defaultValue: 'Flashcards' })}
                </button>
              ))}
            </div>
            {desktopView === 'session' ? timerAndTasks : <RmhStudyFlashcards />}
          </div>
        </div>

        {/* Sidebar — Members + Chat */}
        <div className="w-80 border-l border-(--app-border) flex flex-col bg-(--app-bg-subtle)">
          <div className="border-b border-(--app-border)">
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
          {mobileTab === 'flashcards' && <RmhStudyFlashcards />}
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
        {/* The bar's surface reaches the physical bottom; the inset keeps its four
            targets above the home indicator. */}
        <div className="shrink-0 flex border-t border-(--app-border) bg-(--app-surface) pb-[var(--safe-bottom)] pl-[var(--safe-left)] pr-[var(--safe-right)]">
          <button
            onClick={() => setMobileTab('session')}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors ${
              mobileTab === 'session' ? 'text-(--app-accent)' : 'text-(--app-text-muted)'
            }`}
          >
            <Timer className="h-4 w-4" />
            {t('tab-session', { defaultValue: 'Session' })}
          </button>
          <button
            onClick={() => setMobileTab('flashcards')}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors ${
              mobileTab === 'flashcards' ? 'text-(--app-accent)' : 'text-(--app-text-muted)'
            }`}
          >
            <Layers className="h-4 w-4" />
            {t('tab-cards', { defaultValue: 'Cards' })}
          </button>
          <button
            onClick={() => setMobileTab('members')}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors ${
              mobileTab === 'members' ? 'text-(--app-accent)' : 'text-(--app-text-muted)'
            }`}
          >
            <Users className="h-4 w-4" />
            {t('tab-members', { defaultValue: 'Members' })}
          </button>
          <button
            onClick={() => { setMobileTab('chat'); setUnreadChat(0); }}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors relative ${
              mobileTab === 'chat' ? 'text-(--app-accent)' : 'text-(--app-text-muted)'
            }`}
          >
            <MessageCircle className="h-4 w-4" />
            {t('tab-chat', { defaultValue: 'Chat' })}
            {unreadChat > 0 && (
              <span className="absolute top-1.5 right-1/4 h-4 min-w-4 px-1 flex items-center justify-center rounded-full bg-(--app-accent) text-(--app-accent-fg) text-[10px] font-bold">
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
          <div className="relative w-full max-w-md rounded-xl border border-(--app-border) bg-(--app-surface) p-6 shadow-xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                {isHost ? <Settings className="h-5 w-5 text-(--app-accent)" /> : <Info className="h-5 w-5 text-(--app-accent)" />}
                {isHost ? t('room-settings', { defaultValue: 'Room Settings' }) : t('room-info', { defaultValue: 'Room Info' })}
              </h3>
              <button
                onClick={() => setShowSettings(false)}
                className="p-1 rounded-lg text-(--app-text-muted) hover:text-(--app-text) transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {isHost && timer.phase !== 'idle' && (
              <p className="text-xs text-(--app-warning) mb-4">
                {t('settings-idle-only', { defaultValue: 'Settings can only be changed while the timer is idle.' })}
              </p>
            )}

            <div className="space-y-5">
              {/* Work Duration */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-(--app-text-muted)">{t('focus-duration', { defaultValue: 'Focus Duration' })}</label>
                  <span className="text-sm font-mono font-bold text-(--app-text)">{Math.round(room.settings.workDurationMs / 60000)} min</span>
                </div>
                {isHost && timer.phase === 'idle' ? (
                  <div className="flex gap-1.5">
                    {[15, 25, 30, 45, 60, 90].map((m) => (
                      <button
                        key={m}
                        onClick={() => handleUpdateSetting('workDurationMs', m * 60000)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          Math.round(room.settings.workDurationMs / 60000) === m
                            ? 'bg-(--app-accent) text-(--app-accent-fg)'
                            : 'bg-(--app-bg) text-(--app-text-muted) hover:bg-(--app-surface-hover)'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="h-8 flex items-center px-3 rounded-lg bg-(--app-bg) text-sm text-(--app-text-muted)">
                    {t('n-minutes', { defaultValue: '{{count}} minutes', count: Math.round(room.settings.workDurationMs / 60000) })}
                  </div>
                )}
              </div>

              {/* Short Break */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-(--app-text-muted)">{t('short-break', { defaultValue: 'Short Break' })}</label>
                  <span className="text-sm font-mono font-bold text-(--app-text)">{Math.round(room.settings.shortBreakMs / 60000)} min</span>
                </div>
                {isHost && timer.phase === 'idle' ? (
                  <div className="flex gap-1.5">
                    {[3, 5, 10, 15].map((m) => (
                      <button
                        key={m}
                        onClick={() => handleUpdateSetting('shortBreakMs', m * 60000)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          Math.round(room.settings.shortBreakMs / 60000) === m
                            ? 'bg-(--app-accent) text-(--app-accent-fg)'
                            : 'bg-(--app-bg) text-(--app-text-muted) hover:bg-(--app-surface-hover)'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="h-8 flex items-center px-3 rounded-lg bg-(--app-bg) text-sm text-(--app-text-muted)">
                    {t('n-minutes', { defaultValue: '{{count}} minutes', count: Math.round(room.settings.shortBreakMs / 60000) })}
                  </div>
                )}
              </div>

              {/* Long Break */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-(--app-text-muted)">{t('long-break', { defaultValue: 'Long Break' })}</label>
                  <span className="text-sm font-mono font-bold text-(--app-text)">{Math.round(room.settings.longBreakMs / 60000)} min</span>
                </div>
                {isHost && timer.phase === 'idle' ? (
                  <div className="flex gap-1.5">
                    {[10, 15, 20, 30].map((m) => (
                      <button
                        key={m}
                        onClick={() => handleUpdateSetting('longBreakMs', m * 60000)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          Math.round(room.settings.longBreakMs / 60000) === m
                            ? 'bg-(--app-accent) text-(--app-accent-fg)'
                            : 'bg-(--app-bg) text-(--app-text-muted) hover:bg-(--app-surface-hover)'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="h-8 flex items-center px-3 rounded-lg bg-(--app-bg) text-sm text-(--app-text-muted)">
                    {t('n-minutes', { defaultValue: '{{count}} minutes', count: Math.round(room.settings.longBreakMs / 60000) })}
                  </div>
                )}
              </div>

              {/* Sessions before long break */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-(--app-text-muted)">{t('sessions-before-long-break', { defaultValue: 'Sessions before long break' })}</label>
                  <span className="text-sm font-mono font-bold text-(--app-text)">{room.settings.sessionsBeforeLongBreak}</span>
                </div>
                {isHost && timer.phase === 'idle' ? (
                  <input
                    type="range"
                    min={1}
                    max={12}
                    value={room.settings.sessionsBeforeLongBreak}
                    onChange={(e) => handleUpdateSetting('sessionsBeforeLongBreak', Number(e.target.value))}
                    className="w-full accent-(--app-accent)"
                  />
                ) : (
                  <div className="h-8 flex items-center px-3 rounded-lg bg-(--app-bg) text-sm text-(--app-text-muted)">
                    {t('n-sessions', { defaultValue: '{{count}} sessions', count: room.settings.sessionsBeforeLongBreak })}
                  </div>
                )}
              </div>

              {/* Auto-start toggles */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-(--app-text-muted)">{t('auto-start-breaks', { defaultValue: 'Auto-start breaks' })}</label>
                  {isHost && timer.phase === 'idle' ? (
                    <button
                      onClick={() => handleUpdateSetting('autoStartBreaks', !room.settings.autoStartBreaks)}
                      className={`relative w-10 h-5.5 rounded-full transition-colors ${
                        room.settings.autoStartBreaks ? 'bg-(--app-accent)' : 'bg-(--app-border-bright)'
                      }`}
                    >
                      <span className={`absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white transition-transform ${
                        room.settings.autoStartBreaks ? 'translate-x-5' : 'translate-x-0.5'
                      }`} />
                    </button>
                  ) : (
                    <span className="text-sm text-(--app-text)">{room.settings.autoStartBreaks ? t('on', { defaultValue: 'On' }) : t('off', { defaultValue: 'Off' })}</span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-(--app-text-muted)">{t('auto-start-work-sessions', { defaultValue: 'Auto-start work sessions' })}</label>
                  {isHost && timer.phase === 'idle' ? (
                    <button
                      onClick={() => handleUpdateSetting('autoStartWork', !room.settings.autoStartWork)}
                      className={`relative w-10 h-5.5 rounded-full transition-colors ${
                        room.settings.autoStartWork ? 'bg-(--app-accent)' : 'bg-(--app-border-bright)'
                      }`}
                    >
                      <span className={`absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white transition-transform ${
                        room.settings.autoStartWork ? 'translate-x-5' : 'translate-x-0.5'
                      }`} />
                    </button>
                  ) : (
                    <span className="text-sm text-(--app-text)">{room.settings.autoStartWork ? t('on', { defaultValue: 'On' }) : t('off', { defaultValue: 'Off' })}</span>
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
          <div className="relative w-full max-w-sm rounded-xl border border-(--app-border) bg-(--app-surface) p-6 shadow-xl">
            <h3 className="text-lg font-semibold mb-2">{t('ban-confirm-title', { defaultValue: 'Ban {{userName}}?', userName: banTarget.userName })}</h3>
            <p className="text-sm text-(--app-text-muted) mb-4">
              {t('ban-confirm-desc', { defaultValue: 'This member will be removed and cannot rejoin this room.' })}
            </p>
            <input
              type="text"
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              placeholder={t('ban-reason-placeholder', { defaultValue: 'Reason (optional)' })}
              maxLength={200}
              className="w-full px-3 py-2 rounded-lg text-sm border border-(--app-border) bg-(--app-bg) text-(--app-text) placeholder:text-(--app-text-dim) outline-none focus:ring-1 focus:ring-(--app-accent) mb-4"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setBanTarget(null); setBanReason(''); }}
                className="flex-1 py-2 rounded-lg font-medium text-sm transition-colors bg-(--app-bg) text-(--app-text-muted) hover:text-(--app-text)"
              >
                {t('cancel', { defaultValue: 'Cancel' })}
              </button>
              <button
                onClick={handleBanConfirm}
                className="flex-1 py-2 rounded-lg font-medium text-sm text-white transition-colors bg-(--app-danger) hover:opacity-90"
              >
                {t('ban', { defaultValue: 'Ban' })}
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
