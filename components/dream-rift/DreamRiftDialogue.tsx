'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { DialogueLine } from '@/lib/dream-rift/types';

// --- Constants ---
const TYPEWRITER_MS = 30;

/** Map speaker names to portrait placeholder colours. */
const SPEAKER_COLORS: Record<string, string> = {
  rei:      'bg-red-500',
  yume:     'bg-violet-500',
  narrator: 'bg-slate-600',
  hana:     'bg-pink-400',
  sorin:    'bg-cyan-400',
  mira:     'bg-amber-400',
  echo:     'bg-emerald-400',
  void:     'bg-gray-800',
};

function getSpeakerColor(speaker: string): string {
  return SPEAKER_COLORS[speaker.toLowerCase()] ?? 'bg-indigo-500';
}

// --- Props ---
interface DreamRiftDialogueProps {
  line: DialogueLine;
  onAdvance: () => void;
  onSkip: () => void;
}

export function DreamRiftDialogue({ line, onAdvance, onSkip }: DreamRiftDialogueProps) {
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const indexRef = useRef(0);

  // Reset typewriter whenever the line changes.
  useEffect(() => {
    setDisplayedText('');
    setIsTyping(true);
    indexRef.current = 0;

    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    const text = line.text;
    if (!text || text.length === 0) {
      setIsTyping(false);
      return;
    }

    timerRef.current = setInterval(() => {
      indexRef.current++;
      setDisplayedText(text.slice(0, indexRef.current));

      if (indexRef.current >= text.length) {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
        setIsTyping(false);
      }
    }, TYPEWRITER_MS);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [line]);

  /** Complete the current line instantly, or advance to next if already done. */
  const handleClick = useCallback(() => {
    if (isTyping) {
      // Finish typing instantly
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setDisplayedText(line.text);
      setIsTyping(false);
    } else {
      onAdvance();
    }
  }, [isTyping, line.text, onAdvance]);

  // Keyboard: Enter/Space to click-through, Escape to skip.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        handleClick();
      } else if (e.code === 'Escape') {
        e.preventDefault();
        onSkip();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleClick, onSkip]);

  const speakerLabel =
    line.speaker.toLowerCase() === 'narrator'
      ? ''
      : line.speaker;

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      className="absolute inset-x-0 bottom-0 z-40 select-none cursor-pointer"
      onClick={handleClick}
    >
      <div className="bg-black/85 border-t border-white/20 px-4 py-3 flex items-start gap-3">
        {/* Portrait placeholder */}
        <div
          className={`
            w-16 h-16 flex-shrink-0 rounded
            ${getSpeakerColor(line.speaker)}
            flex items-center justify-center text-xs font-bold text-white/80 uppercase
          `}
        >
          {line.portrait ?? line.speaker.slice(0, 3)}
        </div>

        {/* Text column */}
        <div className="flex-1 min-w-0">
          {speakerLabel && (
            <p className="text-yellow-400 text-sm font-bold mb-1 tracking-wide">
              {speakerLabel}
            </p>
          )}
          <p className="text-white text-sm leading-relaxed whitespace-pre-wrap min-h-[2.5rem]">
            {displayedText}
            {isTyping && (
              <span className="inline-block w-1.5 h-3.5 bg-white/70 ml-0.5 animate-pulse align-middle" />
            )}
          </p>
        </div>

        {/* Skip button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSkip();
          }}
          className="
            flex-shrink-0 text-white/40 hover:text-white/80
            text-xs px-2 py-1 border border-white/20 rounded
            transition-colors uppercase tracking-widest
          "
        >
          Skip
        </button>
      </div>

      {/* Advance hint */}
      {!isTyping && (
        <div className="absolute bottom-1 right-14 text-white/30 text-xs animate-pulse">
          Click to continue
        </div>
      )}
    </div>
  );
}
