/**
 * RMH Type Solo Mode Page
 *
 * Individual typing practice with WPM/accuracy tracking.
 */

'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { RotateCcw, Trophy } from 'lucide-react';
import { connectToRmhType, emit } from '@/lib/rmhtype/socket';
import { useRmhTypeStore } from '@/lib/rmhtype/store';
import { C2S } from '@/lib/rmhtype/events';
import { toast } from '@/lib/rmhtype/toast-store';
import RmhTypeHeader from '@/components/rmhtype/RmhTypeHeader';
import type { Difficulty, PassageLength } from '@/lib/rmhtype/types';

export default function RmhTypeSolo() {
  const router = useRouter();
  const soloPassage = useRmhTypeStore((s) => s.soloPassage);
  const soloPassageId = useRmhTypeStore((s) => s.soloPassageId);
  const soloResult = useRmhTypeStore((s) => s.soloResult);
  const soloCountdown = useRmhTypeStore((s) => s.soloCountdown);
  const settings = useRmhTypeStore((s) => s.settings);
  const connectionStatus = useRmhTypeStore((s) => s.connectionStatus);

  const [typedText, setTypedText] = useState('');
  const [startTime, setStartTime] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const passageRef = useRef<HTMLDivElement>(null);

  // Connect on mount
  useEffect(() => {
    let mounted = true;
    async function init() {
      try {
        await connectToRmhType();
        // If no passage yet, request one
        if (!soloPassage && mounted) {
          emit(C2S.SOLO_START, {
            difficulty: settings.soloDifficulty,
            passageLength: settings.soloPassageLength,
          });
        }
      } catch (err) {
        if (mounted) toast.error(err instanceof Error ? err.message : 'Connection failed');
      }
    }
    init();
    return () => { mounted = false; };
  }, []);

  // Auto-scroll passage to keep cursor visible (mobile keyboard)
  useEffect(() => {
    if (!passageRef.current) return;
    const cursor = passageRef.current.querySelector('.rmhtype-cursor');
    if (cursor) {
      cursor.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [typedText]);

  // Focus input when passage arrives
  useEffect(() => {
    if (soloPassage && !soloResult) {
      setTypedText('');
      setStartTime(null);
      setFinished(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [soloPassage, soloResult]);

  const handleTyping = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!soloPassage || finished) return;
    const value = e.target.value;

    // Start timer on first keystroke
    if (!startTime) setStartTime(Date.now());

    setTypedText(value);

    // Check if finished
    if (value.length >= soloPassage.length) {
      setFinished(true);
      const errors = [...value].filter((c, i) => c !== soloPassage[i]).length;

      emit(C2S.SOLO_FINISH, {
        position: value.length,
        errors,
      });
    }
  }, [soloPassage, soloPassageId, finished, startTime]);

  const handleRetry = useCallback(() => {
    useRmhTypeStore.getState().clearSolo();
    setTypedText('');
    setStartTime(null);
    setFinished(false);
    emit(C2S.SOLO_START, {
      difficulty: settings.soloDifficulty,
      passageLength: settings.soloPassageLength,
    });
  }, [settings.soloDifficulty, settings.soloPassageLength]);

  const handleBack = useCallback(() => {
    useRmhTypeStore.getState().clearSolo();
    router.push('/rmhtype');
  }, [router]);

  // Countdown state
  if (soloCountdown !== null) {
    return (
      <div className="flex h-screen flex-col">
        <RmhTypeHeader backLabel="Back" onBack={handleBack} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-8xl font-bold text-(--rmhtype-accent) animate-pulse">
            {soloCountdown}
          </div>
        </div>
      </div>
    );
  }

  // Results state
  if (soloResult) {
    return (
      <div className="flex h-screen flex-col">
        <RmhTypeHeader backLabel="Back" onBack={handleBack} />
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-lg mx-auto">
            <div className="rounded-xl border border-(--rmhtype-border) bg-(--rmhtype-surface) p-8 text-center">
              <Trophy className="h-12 w-12 mx-auto mb-4 text-(--rmhtype-accent)" />
              <h2 className="text-2xl font-bold mb-6">Results</h2>

              {soloResult.timedOut && (
                <p className="text-sm text-(--rmhtype-text-muted) mb-4">Time ran out!</p>
              )}

              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="p-4 rounded-lg bg-(--rmhtype-bg)">
                  <div className="text-3xl font-bold text-(--rmhtype-accent)">{soloResult.wpm}</div>
                  <div className="text-xs text-(--rmhtype-text-muted)">WPM</div>
                </div>
                <div className="p-4 rounded-lg bg-(--rmhtype-bg)">
                  <div className="text-3xl font-bold text-(--rmhtype-accent)">{soloResult.accuracy}%</div>
                  <div className="text-xs text-(--rmhtype-text-muted)">Accuracy</div>
                </div>
                <div className="p-4 rounded-lg bg-(--rmhtype-bg)">
                  <div className="text-3xl font-bold">{(soloResult.timeMs / 1000).toFixed(1)}s</div>
                  <div className="text-xs text-(--rmhtype-text-muted)">Time</div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleRetry}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-semibold text-white transition-colors bg-(--rmhtype-accent) hover:bg-(--rmhtype-accent-hover)"
                >
                  <RotateCcw className="h-4 w-4" />
                  Try Again
                </button>
                <button
                  onClick={handleBack}
                  className="flex-1 py-3 rounded-lg font-semibold transition-colors bg-(--rmhtype-surface-hover) text-(--rmhtype-text) hover:bg-(--rmhtype-surface-active)"
                >
                  Back to Menu
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Typing state
  return (
    <div className="flex h-screen flex-col">
      <RmhTypeHeader backLabel="Back" onBack={handleBack} />

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="max-w-3xl mx-auto space-y-6">
          {!soloPassage ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-pulse text-(--rmhtype-text-muted)">
                {connectionStatus === 'connecting' ? 'Connecting...' : 'Loading passage...'}
              </div>
            </div>
          ) : (
            <>
              {/* Live WPM */}
              {startTime && !finished && (
                <div className="text-center">
                  <span className="text-2xl font-bold text-(--rmhtype-accent) font-mono">
                    {Math.round(((typedText.length / 5) / ((Date.now() - startTime) / 60000)) || 0)} WPM
                  </span>
                </div>
              )}

              {/* Passage */}
              <div ref={passageRef} className="rounded-xl border border-(--rmhtype-border) bg-(--rmhtype-surface) p-6 rmhtype-passage-scroll">
                <div className="rmhtype-passage select-none">
                  {[...soloPassage].map((char, i) => {
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

              {/* Input */}
              <input
                ref={inputRef}
                type="text"
                value={typedText}
                onChange={handleTyping}
                disabled={finished}
                className="w-full px-4 py-3 rounded-lg font-mono border border-(--rmhtype-border) bg-(--rmhtype-bg) text-(--rmhtype-text) outline-none focus:ring-1 focus:ring-(--rmhtype-accent)"
                autoFocus
                placeholder="Start typing..."
              />

              {/* Progress */}
              <div className="rmhtype-progress-bar">
                <div
                  className="rmhtype-progress-fill"
                  style={{ width: `${(typedText.length / soloPassage.length) * 100}%` }}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
