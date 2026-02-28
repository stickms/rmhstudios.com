'use client';

import { useEffect, useCallback } from 'react';
import { useGameStore } from '@/lib/rmhpoetry/store';
import { MainMenu } from './MainMenu';
import { SettingsMenu } from './SettingsMenu';
import { DialogueScreen } from './DialogueScreen';
import { WordSelectPuzzle } from './WordSelectPuzzle';
import { LineArrangePuzzle } from './LineArrangePuzzle';
import { PoemPresentation } from './PoemPresentation';
import { ChapterSummary } from './ChapterSummary';
import { PoemJournal } from './PoemJournal';
import { SaveLoadMenu } from './SaveLoadMenu';

export function VersecraftGame() {
  const screen = useGameStore(s => s.screen);
  const incrementPlaytime = useGameStore(s => s.incrementPlaytime);

  // Track playtime every second
  useEffect(() => {
    const interval = setInterval(incrementPlaytime, 1000);
    return () => clearInterval(interval);
  }, [incrementPlaytime]);

  // Prevent default scroll on space
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Space' && screen === 'dialogue') {
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [screen]);

  const renderScreen = useCallback(() => {
    switch (screen) {
      case 'menu':
        return <MainMenu />;
      case 'settings':
        return <SettingsMenu />;
      case 'dialogue':
        return <DialogueScreen />;
      case 'puzzle_word_select':
        return <WordSelectPuzzle />;
      case 'puzzle_line_arrange':
        return <LineArrangePuzzle />;
      case 'presentation':
        return <PoemPresentation />;
      case 'summary':
        return <ChapterSummary />;
      case 'journal':
        return <PoemJournal />;
      case 'save':
      case 'load':
        return <SaveLoadMenu mode={screen === 'save' ? 'save' : 'load'} />;
      default:
        return <MainMenu />;
    }
  }, [screen]);

  return (
    <div
      className="relative w-full min-h-screen overflow-hidden select-none"
      style={{
        backgroundColor: '#1a1520',
        color: '#e8e0d0',
        fontFamily: 'var(--font-nunito, var(--font-inter, sans-serif))',
      }}
    >
      {renderScreen()}
    </div>
  );
}
