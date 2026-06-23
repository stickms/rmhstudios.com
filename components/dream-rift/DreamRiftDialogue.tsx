'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { DialogueLine } from '@/lib/dream-rift/types';

const TYPEWRITER_MS = 30;

/** Map speaker names to accent colours for the name plate. */
const SPEAKER_COLORS: Record<string, string> = {
  rei:      '#ff4466',
  yume:     '#66aaff',
  narrator: '#d4a44a',
  hana:     '#ff88aa',
  sorin:    '#44cccc',
  mira:     '#ffaa44',
  echo:     '#44cc88',
  void:     '#8866aa',
};

function getSpeakerColor(speaker: string): string {
  return SPEAKER_COLORS[speaker.toLowerCase()] ?? '#d4a44a';
}

/** Map speaker names to kanji watermarks. */
const SPEAKER_KANJI: Record<string, string> = {
  rei: '零',
  yume: '夢',
  narrator: '語',
};

interface DreamRiftDialogueProps {
  line: DialogueLine;
  onAdvance: () => void;
  onSkip: () => void;
}

export function DreamRiftDialogue({ line, onAdvance, onSkip }: DreamRiftDialogueProps) {
  const { t } = useTranslation('c-dream-rift');
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const indexRef = useRef(0);

  useEffect(() => {
    setDisplayedText('');
    setIsTyping(true);
    indexRef.current = 0;

    if (timerRef.current) clearInterval(timerRef.current);

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

  const handleClick = useCallback(() => {
    if (isTyping) {
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

  const isNarrator = line.speaker.toLowerCase() === 'narrator';
  const speakerColor = getSpeakerColor(line.speaker);
  const kanji = SPEAKER_KANJI[line.speaker.toLowerCase()] ?? '';

  return (
    <div
      className="absolute inset-x-0 bottom-0 z-40 select-none cursor-pointer"
      onClick={handleClick}
    >
      {/* Dialogue box with Touhou-style border */}
      <div className="mx-2 mb-2">
        <div className="border border-amber-400/40 p-[2px]">
          <div
            className="border border-amber-400/20 px-3 py-2.5 flex items-start gap-3"
            style={{
              background: 'linear-gradient(180deg, rgba(8,6,24,0.95) 0%, rgba(12,8,30,0.97) 100%)',
            }}
          >
            {/* Portrait placeholder */}
            <div
              className="w-14 h-14 flex-shrink-0 border border-amber-400/20 flex items-center justify-center relative overflow-hidden"
              style={{
                background: `radial-gradient(circle at center, ${speakerColor}15 0%, transparent 70%), linear-gradient(180deg, #0a0a1a 0%, #111128 100%)`,
              }}
            >
              {kanji ? (
                <span
                  className="text-[32px] opacity-20 select-none"
                  style={{ color: speakerColor, fontFamily: "'Georgia', serif" }}
                >
                  {kanji}
                </span>
              ) : (
                <span
                  className="text-xs font-bold opacity-40 uppercase tracking-wider"
                  style={{ color: speakerColor }}
                >
                  {line.portrait ?? line.speaker.slice(0, 3)}
                </span>
              )}
            </div>

            {/* Text column */}
            <div className="flex-1 min-w-0">
              {/* Name plate */}
              {!isNarrator && (
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="text-sm font-bold tracking-wider"
                    style={{
                      color: speakerColor,
                      fontFamily: "'Georgia', serif",
                      textShadow: `0 0 8px ${speakerColor}40`,
                    }}
                  >
                    {line.speaker}
                  </span>
                  <div className="flex-1 h-px bg-gradient-to-r from-amber-400/20 to-transparent" />
                </div>
              )}

              {/* Dialogue text */}
              <p
                className="text-[13px] leading-relaxed whitespace-pre-wrap min-h-[2rem]"
                style={{
                  color: isNarrator ? '#b8a870' : '#d0ccc0',
                  fontFamily: "'Georgia', serif",
                  fontStyle: isNarrator ? 'italic' : 'normal',
                }}
              >
                {displayedText}
                {isTyping && (
                  <span
                    className="inline-block w-1 h-3 ml-0.5 animate-pulse align-middle"
                    style={{ backgroundColor: speakerColor }}
                  />
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
              className="flex-shrink-0 text-amber-400/30 hover:text-amber-400/70 text-[9px] px-1.5 py-0.5 border border-amber-400/20 tracking-[0.2em] transition-colors uppercase"
              style={{ fontFamily: "'Georgia', serif" }}
            >
              {t("skip", { defaultValue: "Skip" })}
            </button>
          </div>
        </div>
      </div>

      {/* Advance hint */}
      {!isTyping && (
        <div
          className="absolute bottom-3 right-16 text-amber-400/25 text-[9px] animate-pulse tracking-wider"
          style={{ fontFamily: "'Georgia', serif" }}
        >
          ▸
        </div>
      )}
    </div>
  );
}
