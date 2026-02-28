'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '@/lib/rmhpoetry/store';
import Image from 'next/image';
import { CHARACTERS, getCharacterFirstName } from '@/lib/rmhpoetry/characters';
import { CHAPTER_1, CH01_PUZZLE, CH01_POST_PUZZLE_SCENES } from '@/lib/rmhpoetry/chapters/ch01';
import { getWordPool } from '@/lib/rmhpoetry/words';
import { getSpritePath } from '@/lib/rmhpoetry/sprites';
import type { DialogueNode, Scene } from '@/lib/rmhpoetry/types';

// Background gradient presets
const BACKGROUNDS: Record<string, { gradient: string; label: string }> = {
  school_hallway: { gradient: 'linear-gradient(180deg, #8B7355 0%, #6B5B45 40%, #4A3F35 100%)', label: 'School Hallway' },
  club_room: { gradient: 'linear-gradient(180deg, #C4A35A 0%, #8B7355 30%, #4A3B6B 100%)', label: 'Club Room' },
};

const TIME_FILTERS: Record<string, string> = {
  morning: 'brightness(1.1) saturate(0.9)',
  afternoon: 'brightness(1.0) saturate(1.0)',
  evening: 'brightness(0.85) saturate(0.8) sepia(0.15)',
  night: 'brightness(0.5) saturate(0.6) hue-rotate(200deg)',
};

// Typewriter text component
function TypewriterText({ text, speed, onComplete }: { text: string; speed: number; onComplete: () => void }) {
  const [displayedLength, setDisplayedLength] = useState(0);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    setDisplayedLength(0);
    setComplete(false);
  }, [text]);

  useEffect(() => {
    if (displayedLength >= text.length) {
      setComplete(true);
      onComplete();
      return;
    }
    const timer = setTimeout(() => setDisplayedLength(d => d + 1), speed);
    return () => clearTimeout(timer);
  }, [displayedLength, text, speed, onComplete]);

  const skipToEnd = useCallback(() => {
    if (!complete) {
      setDisplayedLength(text.length);
    }
  }, [complete, text.length]);

  return (
    <span onClick={skipToEnd} className="cursor-pointer">
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
      className="absolute bottom-40 flex flex-col items-center"
      style={{
        left: xPos,
        transform: 'translateX(-50%)',
        filter: isSpeaking ? 'none' : 'brightness(0.7)',
        zIndex: isSpeaking ? 10 : 5,
      }}
      initial={{ opacity: 0, y: 40 }}
      animate={{
        opacity: 1,
        y: [0, -3, 0],
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

  const handleAdvance = useCallback(() => {
    if (!currentScene || !currentNode) return;
    if (currentNode.choices) return; // Don't advance if choices are showing
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
        handleAdvance();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleAdvance]);

  if (!currentScene || !currentNode) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p style={{ color: '#a89888' }}>Loading...</p>
      </div>
    );
  }

  const bg = BACKGROUNDS[currentScene.background] || BACKGROUNDS.club_room;
  const timeFilter = TIME_FILTERS[currentScene.timeOfDay] || '';

  return (
    <div
      className="relative w-full min-h-screen overflow-hidden cursor-pointer"
      onClick={handleAdvance}
    >
      {/* Background */}
      <div
        className="absolute inset-0 transition-all duration-1000"
        style={{ background: bg.gradient, filter: timeFilter }}
      />

      {/* Character sprites */}
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

      {/* Dialogue box */}
      <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6">
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

          {/* Click indicator */}
          {textComplete && !currentNode.choices && (
            <motion.div
              className="text-right mt-2"
              animate={{ opacity: [0.3, 0.8, 0.3] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              <span className="text-xs" style={{ color: '#c4a35a' }}>▸ Click to continue</span>
            </motion.div>
          )}
        </motion.div>

        {/* Quick action bar */}
        <div className="max-w-4xl mx-auto mt-2 flex gap-2 justify-end">
          {(['save', 'journal'] as const).map(action => (
            <button
              key={action}
              onClick={(e) => {
                e.stopPropagation();
                setScreen(action);
              }}
              className="text-xs px-3 py-1 rounded transition-all"
              style={{
                backgroundColor: 'rgba(26, 21, 32, 0.7)',
                border: '1px solid rgba(196, 163, 90, 0.1)',
                color: '#666',
              }}
            >
              {action === 'save' ? 'Save' : 'Journal'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
