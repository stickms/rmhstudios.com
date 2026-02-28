'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/lib/rmhpoetry/store';
import Image from 'next/image';
import { CHARACTERS, getCharacterFirstName } from '@/lib/rmhpoetry/characters';
import { CHAPTER_1, CH01_PUZZLE, CH01_POST_PUZZLE_SCENES } from '@/lib/rmhpoetry/chapters/ch01';
import { getWordPool } from '@/lib/rmhpoetry/words';
import { getSpritePath } from '@/lib/rmhpoetry/sprites';
import type { DialogueNode, Scene } from '@/lib/rmhpoetry/types';

// Background image presets (Sutemo VN backgrounds)
const BG_BASE = '/sprites/versecraft/backgrounds';
const BACKGROUNDS: Record<string, { image: string; fallback: string }> = {
  school_hallway: { image: `${BG_BASE}/school_hallway_day.png`, fallback: '#4A3F35' },
  club_room:      { image: `${BG_BASE}/club_room_day.png`, fallback: '#4A3B6B' },
  classroom:      { image: `${BG_BASE}/classroom_day.png`, fallback: '#5A4A3B' },
  school_stairs:  { image: `${BG_BASE}/school_stairs_day.png`, fallback: '#6B5B45' },
  school_gym:     { image: `${BG_BASE}/school_gym_day.png`, fallback: '#3A4A5B' },
  park:           { image: `${BG_BASE}/park_day.png`, fallback: '#2A4A2B' },
  cafe:           { image: `${BG_BASE}/cafe_day.png`, fallback: '#5A3A2B' },
  personal_room:  { image: `${BG_BASE}/personal_room_day.png`, fallback: '#3A2A4B' },
  beach:          { image: `${BG_BASE}/beach_day.png`, fallback: '#4A6A8B' },
  city:           { image: `${BG_BASE}/city_day.png`, fallback: '#3A3A4B' },
  forest:         { image: `${BG_BASE}/forest_night.png`, fallback: '#1A2A1B' },
};

// Time-of-day variants override the default image
const TIME_BG_VARIANTS: Record<string, Record<string, string>> = {
  school_hallway: { evening: `${BG_BASE}/school_hallway_evening.png` },
  club_room:      { evening: `${BG_BASE}/club_room_evening.png` },
  classroom:      { evening: `${BG_BASE}/classroom_evening.png`, night: `${BG_BASE}/classroom2_night.png` },
  school_stairs:  { evening: `${BG_BASE}/school_stairs_evening.png` },
  park:           { evening: `${BG_BASE}/park_evening.png`, night: `${BG_BASE}/park_night.png` },
  cafe:           { night: `${BG_BASE}/cafe_night.png` },
  personal_room:  { evening: `${BG_BASE}/personal_room_evening.png`, night: `${BG_BASE}/personal_room_night.png` },
  city:           { night: `${BG_BASE}/city_night.png` },
};

const TIME_FILTERS: Record<string, string> = {
  morning: 'brightness(1.1) saturate(0.9)',
  afternoon: 'brightness(1.0) saturate(1.0)',
  evening: 'brightness(0.85) saturate(0.8) sepia(0.15)',
  night: 'brightness(0.5) saturate(0.6) hue-rotate(200deg)',
};

// Typewriter text component
function TypewriterText({ text, speed, onComplete, skipRef }: {
  text: string; speed: number; onComplete: () => void;
  skipRef: React.MutableRefObject<(() => boolean) | null>;
}) {
  const [displayedLength, setDisplayedLength] = useState(0);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    setDisplayedLength(0);
    setComplete(false);
  }, [text]);

  useEffect(() => {
    if (displayedLength >= text.length) {
      if (!complete) {
        setComplete(true);
        onComplete();
      }
      return;
    }
    const timer = setTimeout(() => setDisplayedLength(d => d + 1), speed);
    return () => clearTimeout(timer);
  }, [displayedLength, text, speed, onComplete, complete]);

  // Expose skip function to parent via ref
  useEffect(() => {
    skipRef.current = () => {
      if (!complete) {
        setDisplayedLength(text.length);
        return true; // consumed the click
      }
      return false; // text already complete, let parent handle
    };
    return () => { skipRef.current = null; };
  }, [complete, text.length, skipRef]);

  return (
    <span>
      {text.slice(0, displayedLength)}
      {!complete && <span className="animate-pulse">|</span>}
    </span>
  );
}

// Character sprite with real images
function CharacterSprite({ characterId, expression, position, isSpeaking, spritePack }: {
  characterId: string;
  expression?: string;
  position: 'left' | 'center' | 'right';
  isSpeaking?: boolean;
  spritePack?: 'default' | 'hoshiko';
}) {
  const char = CHARACTERS[characterId];
  if (!char) return null;

  const spritePath = getSpritePath(characterId, expression, spritePack);
  const xPos = position === 'left' ? '10%' : position === 'right' ? '65%' : '35%';

  return (
    <motion.div
      className="absolute bottom-8 flex flex-col items-center"
      style={{
        left: xPos,
        transform: 'translateX(-50%)',
        filter: isSpeaking ? 'none' : 'brightness(0.7)',
        zIndex: isSpeaking ? 10 : 5,
      }}
      initial={{ opacity: 0, y: 20 }}
      animate={{
        opacity: 1,
        y: [0, -4, 0],
        scale: isSpeaking ? 1.02 : 0.98,
      }}
      transition={{
        opacity: { duration: 0.5 },
        y: { duration: 4, repeat: Infinity, ease: 'easeInOut' },
        scale: { duration: 0.3 },
      }}
    >
      {spritePath ? (
        <div className="relative w-50 h-100 md:w-65 md:h-130">
          <Image
            src={spritePath}
            alt={characterId}
            fill
            className="object-contain object-bottom"
            sizes="260px"
            priority
          />
          {/* Character color glow under sprite */}
          <div
            className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-3/4 h-8 rounded-full blur-xl"
            style={{ backgroundColor: `${char.color}30` }}
          />
        </div>
      ) : (
        /* Fallback gradient silhouette if sprite not found */
        <div
          className="w-32 h-64 md:w-40 md:h-80 rounded-t-full"
          style={{
            background: `linear-gradient(180deg, ${char.color}80 0%, ${char.accentColor}60 50%, ${char.color}20 100%)`,
            boxShadow: `0 0 30px ${char.color}30`,
          }}
        />
      )}
    </motion.div>
  );
}

export function DialogueScreen() {
  const {
    currentSceneIndex, currentDialogueIndex, settings,
    setScreen, advanceDialogue, applyChoiceEffects,
    setSceneIndex, startPuzzle,
  } = useGameStore();

  const [textComplete, setTextComplete] = useState(false);
  const skipTextRef = useRef<(() => boolean) | null>(null);

  // Get all scenes in order (main scenes + post-puzzle scenes)
  const allScenes = useMemo(() => [
    ...CHAPTER_1.scenes,
    ...CH01_POST_PUZZLE_SCENES,
  ], []);

  const currentScene = allScenes[currentSceneIndex] as Scene | undefined;
  const currentNode = currentScene?.dialogueNodes[currentDialogueIndex] as DialogueNode | undefined;

  const textSpeed = settings.textSpeed === 'instant' ? 0
    : settings.textSpeed === 'fast' ? 15
    : settings.textSpeed === 'slow' ? 50
    : 30;

  const speakerName = useMemo(() => {
    if (!currentNode?.speaker) return null;
    return getCharacterFirstName(currentNode.speaker, settings.characterPresentations);
  }, [currentNode?.speaker, settings.characterPresentations]);

  const speakerColor = currentNode?.speaker
    ? CHARACTERS[currentNode.speaker]?.color || '#c4a35a'
    : '#c4a35a';

  const handleClick = useCallback(() => {
    if (!currentScene || !currentNode) return;
    if (currentNode.choices) return; // Don't advance if choices are showing

    // First click while typing: skip to end
    if (skipTextRef.current?.()) return;

    // Second click (text complete): advance
    if (!textComplete) return;

    const nextIdx = currentDialogueIndex + 1;
    if (nextIdx < currentScene.dialogueNodes.length) {
      advanceDialogue();
      setTextComplete(false);
    } else {
      // Move to next scene
      const nextSceneIdx = currentSceneIndex + 1;
      // Check if we need to trigger a puzzle (after scene 4 = index 3)
      if (currentSceneIndex === 3) {
        // Trigger the WordSelect puzzle
        const pool = getWordPool(50, ['night', 'flowers', 'solitude', 'warmth', 'light']);
        const puzzle = { ...CH01_PUZZLE, wordPool: pool };
        startPuzzle(puzzle);
        return;
      }
      if (nextSceneIdx < allScenes.length) {
        setSceneIndex(nextSceneIdx);
        setTextComplete(false);
      } else {
        // Chapter complete
        setScreen('summary');
      }
    }
  }, [currentScene, currentNode, currentDialogueIndex, currentSceneIndex, textComplete, advanceDialogue, setSceneIndex, allScenes.length, setScreen, startPuzzle]);

  const handleChoice = useCallback((choiceIndex: number) => {
    if (!currentNode?.choices) return;
    const choice = currentNode.choices[choiceIndex];
    applyChoiceEffects(choice);
    setTextComplete(false);
  }, [currentNode, applyChoiceEffects]);

  // Keyboard handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        handleClick();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleClick]);

  if (!currentScene || !currentNode) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p style={{ color: '#a89888' }}>Loading...</p>
      </div>
    );
  }

  const bg = BACKGROUNDS[currentScene.background] || BACKGROUNDS.club_room;
  const timeFilter = TIME_FILTERS[currentScene.timeOfDay] || '';
  const timeBgVariant = TIME_BG_VARIANTS[currentScene.background]?.[currentScene.timeOfDay];
  const bgImage = timeBgVariant || bg.image;

  return (
    <div
      className="relative w-full min-h-screen overflow-hidden cursor-pointer"
      onClick={handleClick}
    >
      {/* Background — z-0 */}
      <div
        className="absolute inset-0 z-0 transition-all duration-1000"
        style={{ backgroundColor: bg.fallback, filter: timeFilter }}
      >
        <Image
          src={bgImage}
          alt=""
          fill
          className="object-cover"
          sizes="100vw"
          priority
        />
      </div>

      {/* Character sprites — z-10, overflow-hidden clips bottom of sprites */}
      <div className="absolute inset-0 z-10 pointer-events-none overflow-hidden">
        <AnimatePresence>
          {currentScene.charactersPresent.map((charId, i) => {
            const position = currentScene.charactersPresent.length === 1
              ? 'center' as const
              : i === 0 ? 'left' as const : i === 1 ? 'center' as const : 'right' as const;
            return (
              <CharacterSprite
                key={charId}
                characterId={charId}
                expression={currentNode.speaker === charId ? currentNode.expression : undefined}
                position={position}
                isSpeaking={currentNode.speaker === charId}
                spritePack={settings.spritePack}
              />
            );
          })}
        </AnimatePresence>
      </div>

      {/* Dialogue box — z-20, always above sprites */}
      <div className="absolute bottom-0 left-0 right-0 z-20 p-4 md:p-6">
        <motion.div
          className="max-w-4xl mx-auto rounded-lg p-4 md:p-6"
          style={{
            backgroundColor: 'rgba(26, 21, 32, 0.92)',
            border: '1px solid rgba(196, 163, 90, 0.25)',
            backdropFilter: 'blur(8px)',
          }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          key={currentNode.id}
        >
          {/* Speaker name */}
          {speakerName && (
            <div
              className="inline-block px-3 py-1 rounded-sm text-sm font-semibold mb-2"
              style={{
                backgroundColor: `${speakerColor}25`,
                border: `1px solid ${speakerColor}50`,
                color: speakerColor,
                fontFamily: 'var(--font-playfair, serif)',
              }}
            >
              {speakerName}
            </div>
          )}

          {/* Dialogue text */}
          <div
            className="text-base md:text-lg leading-relaxed min-h-[3em]"
            style={{
              fontFamily: currentNode.speaker ? 'var(--font-nunito, sans-serif)' : 'var(--font-patrick-hand, serif)',
              color: currentNode.speaker ? '#e8e0d0' : '#a89888',
              fontStyle: currentNode.speaker ? 'normal' : 'italic',
            }}
          >
            <TypewriterText
              text={currentNode.text}
              speed={textSpeed}
              onComplete={() => setTextComplete(true)}
              skipRef={skipTextRef}
            />
          </div>

          {/* Choices */}
          <AnimatePresence>
            {currentNode.choices && textComplete && (
              <motion.div
                className="mt-4 space-y-2"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                {currentNode.choices.map((choice, i) => (
                  <motion.button
                    key={i}
                    className="w-full text-left px-4 py-2.5 rounded transition-all text-sm md:text-base"
                    style={{
                      backgroundColor: 'rgba(42, 34, 53, 0.6)',
                      border: '1px solid rgba(196, 163, 90, 0.15)',
                      color: '#e8e0d0',
                    }}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + i * 0.1 }}
                    whileHover={{
                      backgroundColor: 'rgba(196, 163, 90, 0.15)',
                      borderColor: 'rgba(196, 163, 90, 0.4)',
                      x: 5,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleChoice(i);
                    }}
                  >
                    {choice.type === 'flirt' && (
                      <span className="mr-2 text-pink-400">♥</span>
                    )}
                    <span className="mr-2" style={{ color: '#c4a35a' }}>▸</span>
                    {choice.text}
                  </motion.button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Fixed-height indicator row — prevents layout shift */}
          {!currentNode.choices && (
            <div className="text-right mt-2 h-5">
              {textComplete ? (
                <motion.span
                  className="text-xs"
                  style={{ color: '#c4a35a' }}
                  animate={{ opacity: [0.3, 0.8, 0.3] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  ▸ Click to continue
                </motion.span>
              ) : (
                <span className="text-xs" style={{ color: '#c4a35a40' }}>...</span>
              )}
            </div>
          )}
        </motion.div>

        {/* Quick action bar */}
        <div className="max-w-4xl mx-auto mt-2 flex gap-2 justify-end">
          {([
            { key: 'menu', label: 'Menu' },
            { key: 'settings', label: 'Settings' },
            { key: 'save', label: 'Save' },
            { key: 'journal', label: 'Journal' },
          ] as const).map(action => (
            <button
              key={action.key}
              onClick={(e) => {
                e.stopPropagation();
                setScreen(action.key);
              }}
              className="text-xs px-3 py-1 rounded transition-all hover:brightness-125"
              style={{
                backgroundColor: 'rgba(26, 21, 32, 0.7)',
                border: '1px solid rgba(196, 163, 90, 0.1)',
                color: '#666',
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
