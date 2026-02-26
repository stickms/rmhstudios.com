/**
 * RMH Study Room Page
 *
 * Handles the study session: timer, members, tasks, chat.
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Crown, Copy, Play, Pause, SkipForward, RotateCcw, Plus, Check, Trash2, Circle } from 'lucide-react';
import { connectToRmhStudy, emit, getSocket } from '@/lib/rmhstudy/socket';
import { useRmhStudyStore } from '@/lib/rmhstudy/store';
import { C2S } from '@/lib/rmhstudy/events';
import { toast } from '@/lib/rmhstudy/toast-store';
import RmhStudyHeader from '@/components/rmhstudy/RmhStudyHeader';
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

export default function RmhStudyRoom() {
  const params = useParams();
  const router = useRouter();
  const roomCode = (params.roomId as string)?.toUpperCase();
  const room = useRmhStudyStore((s) => s.room);
  const tasks = useRmhStudyStore((s) => s.tasks);
  const connectionStatus = useRmhStudyStore((s) => s.connectionStatus);
  const lastPhaseComplete = useRmhStudyStore((s) => s.lastPhaseComplete);

  const [newTask, setNewTask] = useState('');

  // Connect and join
  useEffect(() => {
    let mounted = true;
    async function init() {
      try {
        await connectToRmhStudy();
        if (mounted && roomCode) {
          emit(C2S.ROOM_JOIN, { roomCode });
        }
      } catch (err) {
        if (mounted) toast.error(err instanceof Error ? err.message : 'Connection failed');
      }
    }
    init();
    return () => { mounted = false; };
  }, [roomCode]);

  // Clear phase complete notification
  useEffect(() => {
    if (lastPhaseComplete) {
      const timer = setTimeout(() => {
        useRmhStudyStore.getState().clearPhaseComplete();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [lastPhaseComplete]);

  const handleLeave = useCallback(() => {
    emit(C2S.ROOM_LEAVE, { roomCode });
    useRmhStudyStore.getState().leaveRoom();
    router.push('/rmhstudy');
  }, [roomCode, router]);

  const handleCopyCode = useCallback(() => {
    navigator.clipboard.writeText(roomCode);
    toast.info('Room code copied!');
  }, [roomCode]);

  const handleSendChat = useCallback((message: string) => {
    emit(C2S.ROOM_CHAT, { roomCode, message });
  }, [roomCode]);

  const handleReact = useCallback((messageId: string, emoji: string) => {
    emit(C2S.CHAT_REACT, { messageId, emoji });
  }, []);

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

  return (
    <div className="flex h-screen flex-col">
      <RmhStudyHeader
        backLabel="Leave"
        onBack={handleLeave}
        roomCode={roomCode}
        onCopyCode={handleCopyCode}
      />

      <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
        {/* Main content — Timer + Tasks */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6" style={{ scrollbarGutter: 'stable' }}>
          <div className="max-w-2xl mx-auto space-y-6">

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
        </div>

        {/* Sidebar — Members + Chat */}
        <div className="w-full md:w-80 border-t md:border-t-0 md:border-l border-(--rmhstudy-border) flex flex-col bg-(--rmhstudy-bg-subtle)">
          {/* Members */}
          <div className="p-4 border-b border-(--rmhstudy-border)">
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-2 text-(--rmhstudy-text-muted)">
              Members ({room.members.length})
            </h3>
            <div className="space-y-1">
              {room.members.map((m) => (
                <div key={m.userId} className="flex items-center gap-2 py-1">
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
                </div>
              ))}
            </div>
          </div>

          {/* Chat */}
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
    </div>
  );
}
