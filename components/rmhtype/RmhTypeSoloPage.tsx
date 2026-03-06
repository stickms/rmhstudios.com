/**
 * RMH Type Solo Mode Page
 *
 * Settings selection → countdown → typing → results.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { RotateCcw, Trophy, User } from 'lucide-react';
import { connectToRmhType, emit } from '@/lib/rmhtype/socket';
import { useRmhTypeStore } from '@/lib/rmhtype/store';
import { C2S } from '@/lib/rmhtype/events';
import { toast } from '@/lib/rmhtype/toast-store';
import RmhTypeHeader from '@/components/rmhtype/RmhTypeHeader';
import type { Difficulty, PassageLength } from '@/lib/rmhtype/types';
import { useRouter } from '@tanstack/react-router';

export default function RmhTypeSolo() {
  const router = useRouter();
  const soloPassage = useRmhTypeStore((s) => s.soloPassage);
  const soloPassageId = useRmhTypeStore((s) => s.soloPassageId);
  const soloResult = useRmhTypeStore((s) => s.soloResult);
  const soloCountdown = useRmhTypeStore((s) => s.soloCountdown);
  const settings = useRmhTypeStore((s) => s.settings);
  const updateSettings = useRmhTypeStore((s) => s.updateSettings);
  const connectionStatus = useRmhTypeStore((s) => s.connectionStatus);

  const [soloDifficulty, setSoloDifficulty] = useState<Difficulty>(settings.soloDifficulty);
  const [soloLength, setSoloLength] = useState<PassageLength>(settings.soloPassageLength);
  const [started, setStarted] = useState(false);

  const [typedText, setTypedText] = useState('');
  const [startTime, setStartTime] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const passageRef = useRef<HTMLDivElement>(null);

  // Connect on mount (but don't auto-start)
  useEffect(() => {
    let mounted = true;
    async function init() {
      try {
        await connectToRmhType();
      } catch (err) {
        if (mounted) toast.error(err instanceof Error ? err.message : 'Connection failed');
      }
    }
    init();
    return () => { mounted = false; };
  }, []);

  // Auto-scroll passage to keep cursor visible
  // On short containers (mobile with keyboard), proactively position cursor
  // higher so the next line of text is always visible below
  useEffect(() => {
    const container = passageRef.current;
    if (!container) return;
    const cursor = container.querySelector('.rmhtype-cursor') as HTMLElement | null;
    if (!cursor) return;

    const containerRect = container.getBoundingClientRect();
    const cursorRect = cursor.getBoundingClientRect();
    const containerHeight = containerRect.height;

    if (containerHeight < 200) {
      // Short container: keep cursor at ~40% from top so next lines are visible
      const targetY = containerRect.top + containerHeight * 0.4;
      const diff = cursorRect.top - targetY;
      if (Math.abs(diff) > 4) {
        container.scrollTop += diff;
      }
    } else {
      // Normal: scroll when cursor approaches edges
      if (cursorRect.bottom > containerRect.bottom - 16) {
        container.scrollTop += cursorRect.bottom - containerRect.bottom + 48;
      }
      if (cursorRect.top < containerRect.top + 16) {
        container.scrollTop -= containerRect.top - cursorRect.top + 48;
      }
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

  const handleSoloStart = useCallback(() => {
    updateSettings({ soloDifficulty, soloPassageLength: soloLength });
    useRmhTypeStore.getState().clearSolo();
    setStarted(true);
    emit(C2S.SOLO_START, {
      difficulty: soloDifficulty,
      passageLength: soloLength,
    });
  }, [soloDifficulty, soloLength, updateSettings]);

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

  const handleBackToSettings = useCallback(() => {
    useRmhTypeStore.getState().clearSolo();
    setStarted(false);
    setTypedText('');
    setStartTime(null);
    setFinished(false);
  }, []);

  const handleBack = useCallback(() => {
    useRmhTypeStore.getState().clearSolo();
    router.navigate({ to: '/rmhtype' });
  }, [router]);

  // Settings screen (shown on fresh load / refresh)
  if (!started) {
    return (
      <div className="flex h-screen flex-col">
        <RmhTypeHeader backLabel="RMH Type" backHref="/rmhtype" />

        <div className="flex-1 overflow-y-auto p-4 md:p-8" style={{ scrollbarGutter: 'stable both-edges' }}>
          <div className="max-w-lg mx-auto">
            <div className="rounded-xl border border-(--rmhtype-border) bg-(--rmhtype-surface) p-6">
              <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                <User className="h-5 w-5 text-(--rmhtype-accent)" />
                Solo Practice
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-(--rmhtype-text-muted)">Difficulty</label>
                  <div className="flex gap-2">
                    {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
                      <button
                        key={d}
                        onClick={() => setSoloDifficulty(d)}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                          soloDifficulty === d
                            ? 'bg-(--rmhtype-accent) text-white'
                            : 'bg-(--rmhtype-bg) text-(--rmhtype-text-muted) hover:bg-(--rmhtype-surface-hover)'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-(--rmhtype-text-muted)">Passage Length</label>
                  <div className="flex gap-2">
                    {(['short', 'medium', 'long'] as PassageLength[]).map((l) => (
                      <button
                        key={l}
                        onClick={() => setSoloLength(l)}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                          soloLength === l
                            ? 'bg-(--rmhtype-accent) text-white'
                            : 'bg-(--rmhtype-bg) text-(--rmhtype-text-muted) hover:bg-(--rmhtype-surface-hover)'
                        }`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleSoloStart}
                  disabled={connectionStatus !== 'connected'}
                  className="w-full py-3 mt-4 rounded-lg font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-(--rmhtype-accent) hover:bg-(--rmhtype-accent-hover)"
                >
                  Start Typing
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Countdown state
  if (soloCountdown !== null) {
    return (
      <div className="flex h-screen flex-col">
        <RmhTypeHeader backLabel="Back" onBack={handleBackToSettings} />
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
        <RmhTypeHeader backLabel="Back" onBack={handleBackToSettings} />
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-lg mx-auto">
            <div className="rounded-xl border border-(--rmhtype-border) bg-(--rmhtype-surface) p-8 text-center">
              <Trophy className="h-12 w-12 mx-auto mb-4 text-(--rmhtype-accent)" />
              <h2 className="text-2xl font-bold mb-6">Results</h2>

              {soloResult.timedOut && (
                <p className="text-sm text-(--rmhtype-text-muted) mb-4">Time ran out!</p>
              )}

              {soloResult.scorePosted === false && (
                <p className="text-sm text-red-400 mb-4">
                  Score not posted — 90% accuracy required for leaderboard
                </p>
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
                  onClick={handleBackToSettings}
                  className="flex-1 py-3 rounded-lg font-semibold transition-colors bg-(--rmhtype-surface-hover) text-(--rmhtype-text) hover:bg-(--rmhtype-surface-active)"
                >
                  Change Settings
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
    <div className="flex h-screen flex-col rmhtype-typing-view">
      <RmhTypeHeader backLabel="Back" onBack={handleBackToSettings} />

      <div className="flex-1 min-h-0 flex flex-col p-4 md:p-8">
        <div className="max-w-3xl w-full mx-auto flex-1 min-h-0 flex flex-col gap-4 rmhtype-typing-area">
          {!soloPassage ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="animate-pulse text-(--rmhtype-text-muted)">
                {connectionStatus === 'connecting' ? 'Connecting...' : 'Loading passage...'}
              </div>
            </div>
          ) : (
            <>
              {/* Live WPM / prompt — hidden on short viewports via CSS */}
              {!finished && (
                <div className="text-center shrink-0 rmhtype-wpm-display">
                  <span className="text-2xl font-bold font-mono text-(--rmhtype-accent)">
                    {startTime
                      ? `${Math.round(((typedText.length / 5) / ((Date.now() - startTime) / 60000)) || 0)} WPM`
                      : 'Start typing!'}
                  </span>
                </div>
              )}

              {/* Passage — fills remaining space, scrolls internally */}
              <div ref={passageRef} className="flex-1 min-h-0 rounded-xl border border-(--rmhtype-border) bg-(--rmhtype-surface) p-6 rmhtype-passage-scroll">
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

              {/* Input — pinned below passage, seamless on mobile */}
              <input
                ref={inputRef}
                type="text"
                value={typedText}
                onChange={handleTyping}
                onPaste={(e) => e.preventDefault()}
                onCopy={(e) => e.preventDefault()}
                onCut={(e) => e.preventDefault()}
                disabled={finished}
                className="shrink-0 w-full px-4 py-3 rounded-lg font-mono border border-(--rmhtype-border) bg-(--rmhtype-bg) text-(--rmhtype-text) outline-none focus:ring-1 focus:ring-(--rmhtype-accent) rmhtype-typing-input"
                autoFocus
                placeholder="Start typing..."
              />

              {/* Progress — hidden on short viewports via CSS */}
              <div className="shrink-0 rmhtype-progress-bar rmhtype-progress-section">
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
