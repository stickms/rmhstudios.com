/**
 * RMH Type Room Page
 *
 * Handles the full game flow: lobby, countdown, typing, results.
 */

'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Crown, Check, Copy } from 'lucide-react';
import { connectToRmhType, emit, getSocket } from '@/lib/rmhtype/socket';
import { useRmhTypeStore } from '@/lib/rmhtype/store';
import { C2S } from '@/lib/rmhtype/events';
import { toast } from '@/lib/rmhtype/toast-store';
import RmhTypeHeader from '@/components/rmhtype/RmhTypeHeader';
import ChatPanel from '@/components/shared/ChatPanel';
import type { ChatPanelMessage } from '@/components/shared/ChatPanel';

export default function RmhTypeRoom() {
  const params = useParams();
  const router = useRouter();
  const roomCode = (params.roomId as string)?.toUpperCase();
  const room = useRmhTypeStore((s) => s.room);
  const connectionStatus = useRmhTypeStore((s) => s.connectionStatus);

  // Typing state
  const [typedText, setTypedText] = useState('');
  const [startTime, setStartTime] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const passageRef = useRef<HTMLDivElement>(null);

  // Connect and join on mount
  useEffect(() => {
    let mounted = true;
    async function init() {
      try {
        await connectToRmhType();
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

  // Auto-scroll passage to keep cursor visible (mobile keyboard)
  useEffect(() => {
    if (!passageRef.current) return;
    const cursor = passageRef.current.querySelector('.rmhtype-cursor');
    if (cursor) {
      cursor.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [typedText]);

  // Reset typing state on new passage
  useEffect(() => {
    if (room?.status === 'TYPING' && room.passage) {
      setTypedText('');
      setStartTime(Date.now());
      setFinished(false);
      inputRef.current?.focus();
    }
  }, [room?.status, room?.passage]);

  const handleLeave = useCallback(() => {
    emit(C2S.ROOM_LEAVE, { roomCode });
    useRmhTypeStore.getState().leaveRoom();
    router.push('/rmhtype');
  }, [roomCode, router]);

  const handleCopyCode = useCallback(() => {
    navigator.clipboard.writeText(roomCode);
    toast.info('Room code copied!');
  }, [roomCode]);

  const handleReady = useCallback(() => {
    emit(C2S.ROOM_READY, { roomCode });
  }, [roomCode]);

  const handleStart = useCallback(() => {
    emit(C2S.GAME_START, { roomCode });
  }, [roomCode]);

  const handleTyping = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!room?.passage || finished) return;
    const value = e.target.value;
    setTypedText(value);

    const errors = [...value].filter((c, i) => c !== room.passage![i]).length;
    emit(C2S.GAME_PROGRESS, { position: value.length, errors });

    // Check if finished
    if (value.length >= room.passage.length) {
      setFinished(true);
      emit(C2S.GAME_FINISH, { position: value.length, errors });
    }
  }, [room?.passage, finished, roomCode]);

  const handleSendChat = useCallback((message: string) => {
    emit(C2S.ROOM_CHAT, { roomCode, message });
  }, [roomCode]);

  if (!room) {
    return (
      <div className="flex h-screen flex-col">
        <RmhTypeHeader backLabel="Back" backHref="/rmhtype" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-pulse text-(--rmhtype-text-muted)">
              {connectionStatus === 'connecting' ? 'Connecting...' : 'Joining room...'}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isHost = room.players.some((p) => p.userId === room.myUserId && p.isHost);
  const allReady = room.players.length > 1 && room.players.every((p) => p.isReady || p.isHost);
  const myPlayer = room.players.find((p) => p.userId === room.myUserId);

  return (
    <div className="flex h-screen flex-col">
      <RmhTypeHeader
        backLabel="Leave"
        onBack={handleLeave}
        roomCode={roomCode}
        onCopyCode={handleCopyCode}
      />

      <div className="flex-1 overflow-y-auto p-4 md:p-6" style={{ scrollbarGutter: 'stable both-edges' }}>
        <div className="max-w-5xl mx-auto space-y-6">

          {/* WAITING — Lobby */}
          {room.status === 'WAITING' && (
            <>
              <div className="rounded-xl border border-(--rmhtype-border) bg-(--rmhtype-surface) p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold">Players ({room.players.length}/8)</h2>
                  <button
                    onClick={handleCopyCode}
                    className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-(--rmhtype-bg) text-(--rmhtype-text-muted) hover:text-(--rmhtype-text)"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {roomCode}
                  </button>
                </div>
                <div className="space-y-2">
                  {room.players.map((p) => (
                    <div key={p.userId} className="flex items-center justify-between p-3 rounded-lg bg-(--rmhtype-bg)">
                      <div className="flex items-center gap-2">
                        {p.isHost && <Crown className="h-4 w-4 text-(--rmhtype-accent)" />}
                        <span className="font-medium">{p.userName}</span>
                      </div>
                      {p.isReady && <Check className="h-4 w-4 text-(--rmhtype-success)" />}
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex gap-3">
                  {!isHost && (
                    <button
                      onClick={handleReady}
                      className={`flex-1 py-2.5 rounded-lg font-semibold transition-colors ${
                        myPlayer?.isReady
                          ? 'bg-(--rmhtype-success) text-white'
                          : 'bg-(--rmhtype-surface-hover) text-(--rmhtype-text) hover:bg-(--rmhtype-accent) hover:text-white'
                      }`}
                    >
                      {myPlayer?.isReady ? 'Ready!' : 'Ready Up'}
                    </button>
                  )}
                  {isHost && (
                    <button
                      onClick={handleStart}
                      disabled={!allReady}
                      className="flex-1 py-2.5 rounded-lg font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-(--rmhtype-accent) hover:bg-(--rmhtype-accent-hover)"
                    >
                      Start Game
                    </button>
                  )}
                </div>

                <div className="mt-4 p-3 rounded-lg bg-(--rmhtype-bg) text-sm text-(--rmhtype-text-muted)">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-xs uppercase tracking-wide">Difficulty</div>
                      <div className="font-medium text-(--rmhtype-text) capitalize">{room.settings.difficulty}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide">Length</div>
                      <div className="font-medium text-(--rmhtype-text) capitalize">{room.settings.passageLength}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide">Rounds</div>
                      <div className="font-medium text-(--rmhtype-text)">{room.totalRounds}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Chat */}
              <div className="rounded-xl border border-(--rmhtype-border) bg-(--rmhtype-surface) overflow-hidden" style={{ height: '16rem' }}>
                <ChatPanel
                  messages={room.chat as ChatPanelMessage[]}
                  onSendMessage={handleSendChat}
                  myUserId={room.myUserId}
                  themePrefix="rmhtype"
                  showReactions={false}
                  showMediaEmbeds
                  placeholder="Type a message..."
                  className="h-full"
                />
              </div>
            </>
          )}

          {/* COUNTDOWN */}
          {room.status === 'COUNTDOWN' && (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <div className="text-8xl font-bold text-(--rmhtype-accent) animate-pulse">
                  {room.countdownSeconds ?? '...'}
                </div>
                <p className="mt-4 text-(--rmhtype-text-muted)">Get ready to type!</p>
                <p className="text-sm text-(--rmhtype-text-dim)">
                  Round {room.currentRound} of {room.totalRounds}
                </p>
              </div>
            </div>
          )}

          {/* TYPING */}
          {room.status === 'TYPING' && room.passage && (
            <>
              <div className="text-sm text-(--rmhtype-text-muted) text-center">
                Round {room.currentRound} of {room.totalRounds}
              </div>

              {/* Passage display */}
              <div ref={passageRef} className="rounded-xl border border-(--rmhtype-border) bg-(--rmhtype-surface) p-6 rmhtype-passage-scroll">
                <div className="rmhtype-passage select-none">
                  {[...room.passage].map((char, i) => {
                    let className = 'rmhtype-char-untyped';
                    if (i < typedText.length) {
                      className = typedText[i] === char ? 'rmhtype-char-correct' : 'rmhtype-char-incorrect';
                    }
                    if (i === typedText.length) className += ' rmhtype-cursor';
                    return (
                      <span key={i} className={className}>
                        {char}
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Hidden input for capturing keystrokes */}
              <input
                ref={inputRef}
                type="text"
                value={typedText}
                onChange={handleTyping}
                disabled={finished}
                className="w-full px-4 py-3 rounded-lg font-mono border border-(--rmhtype-border) bg-(--rmhtype-bg) text-(--rmhtype-text) outline-none focus:ring-1 focus:ring-(--rmhtype-accent)"
                autoFocus
                placeholder={finished ? 'Waiting for others...' : 'Start typing...'}
              />

              {/* Progress bars */}
              <div className="space-y-2">
                {room.progress.map((p) => (
                  <div key={p.userId} className="flex items-center gap-3">
                    <span className="text-sm font-medium w-24 truncate text-(--rmhtype-text-muted)">{p.userName}</span>
                    <div className="flex-1 rmhtype-progress-bar">
                      <div
                        className="rmhtype-progress-fill"
                        style={{ width: `${p.totalChars > 0 ? (p.charsTyped / p.totalChars) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="text-sm font-mono w-16 text-right text-(--rmhtype-text-muted)">
                      {p.wpm} WPM
                    </span>
                    {p.finished && <Check className="h-4 w-4 text-(--rmhtype-success)" />}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ROUND_RESULTS */}
          {room.status === 'ROUND_RESULTS' && room.roundResults && (
            <div className="rounded-xl border border-(--rmhtype-border) bg-(--rmhtype-surface) p-6">
              <h2 className="text-xl font-semibold mb-4 text-center">
                Round {room.roundResults.round} Results
              </h2>
              <div className="space-y-2">
                {room.roundResults.rankings.map((r, i) => (
                  <div key={r.userId} className={`flex items-center justify-between p-3 rounded-lg ${
                    i === 0 ? 'bg-(--rmhtype-accent-dim) border border-(--rmhtype-accent)' : 'bg-(--rmhtype-bg)'
                  }`}>
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold w-8 text-center text-(--rmhtype-text-dim)">#{r.rank}</span>
                      <span className="font-medium">{r.userName}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-(--rmhtype-text-muted)">
                      <span>{r.wpm} WPM</span>
                      <span>{r.accuracy}%</span>
                      <span className="font-bold text-(--rmhtype-accent)">{r.score} pts</span>
                    </div>
                  </div>
                ))}
              </div>
              {!room.roundResults.isLastRound && (
                <p className="text-center text-sm mt-4 text-(--rmhtype-text-muted) animate-pulse">
                  Next round starting soon...
                </p>
              )}
            </div>
          )}

          {/* FINAL_RESULTS */}
          {room.status === 'FINAL_RESULTS' && room.finalResults && (
            <div className="rounded-xl border border-(--rmhtype-border) bg-(--rmhtype-surface) p-6">
              <h2 className="text-2xl font-bold mb-6 text-center">Final Results</h2>
              <div className="space-y-2">
                {room.finalResults.rankings.map((r, i) => (
                  <div key={r.userId} className={`flex items-center justify-between p-4 rounded-lg ${
                    i === 0 ? 'bg-(--rmhtype-accent-dim) border-2 border-(--rmhtype-accent)' : 'bg-(--rmhtype-bg)'
                  }`}>
                    <div className="flex items-center gap-3">
                      <span className="text-xl font-bold w-10 text-center">{i === 0 ? '🏆' : `#${r.rank}`}</span>
                      <span className="font-semibold text-lg">{r.userName}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-(--rmhtype-accent)">{r.totalScore}</div>
                      <div className="text-xs text-(--rmhtype-text-muted)">Total Score</div>
                    </div>
                  </div>
                ))}
              </div>
              {isHost && (
                <button
                  onClick={handleStart}
                  className="w-full mt-6 py-3 rounded-lg font-semibold text-white transition-colors bg-(--rmhtype-accent) hover:bg-(--rmhtype-accent-hover)"
                >
                  Play Again
                </button>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
