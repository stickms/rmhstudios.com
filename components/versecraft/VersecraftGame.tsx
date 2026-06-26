'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { useGameStore } from '@/lib/versecraft/store';
import { loadGame } from '@/lib/versecraft/persistence';
import { MainMenu } from './MainMenu';
import { SettingsMenu } from './SettingsMenu';
import { WorldSetup } from './WorldSetup';
import { DialogueScreen } from './DialogueScreen';
import { GeneratedDialogueScreen } from './GeneratedDialogueScreen';
import { GeneratedPoemMoment } from './GeneratedPoemMoment';
import { CastScreen } from './CastScreen';
import { CompletionScreen } from './CompletionScreen';
import { WordSelectPuzzle } from './WordSelectPuzzle';
import { LineArrangePuzzle } from './LineArrangePuzzle';
import { PoemPresentation } from './PoemPresentation';
import { ChapterSummary } from './ChapterSummary';
import { PoemJournal } from './PoemJournal';
import { SaveLoadMenu } from './SaveLoadMenu';
import { ProgressScreen } from './ProgressScreen';
import type { GameScreen } from '@/lib/versecraft/types';

// Screens that are safe to restore on refresh (not mid-puzzle or transient)
const RESTORABLE_SCREENS = new Set<GameScreen>([
  'dialogue', 'menu', 'journal', 'save', 'load', 'settings', 'progress',
]);

export function VersecraftGame({ isLoggedIn }: { isLoggedIn: boolean }) {
  const { t } = useTranslation("c-versecraft");
  const screen = useGameStore(s => s.screen);
  const mode = useGameStore(s => s.mode);
  const gameStarted = useGameStore(s => s.gameStarted);
  const incrementPlaytime = useGameStore(s => s.incrementPlaytime);
  const setLoggedIn = useGameStore(s => s.setLoggedIn);
  const setScreen = useGameStore(s => s.setScreen);
  const triggerAutoSave = useGameStore(s => s.triggerAutoSave);

  const searchParams = useSearch({ strict: false }) as Record<string, string | undefined>;
  const navigate = useNavigate();
  const initializedRef = useRef(false);

  // Set logged-in state on mount
  useEffect(() => {
    setLoggedIn(isLoggedIn);
  }, [isLoggedIn, setLoggedIn]);

  // Restore screen from URL on mount (once)
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const urlScreen = (searchParams.s ?? null) as GameScreen | null;
    if (urlScreen && RESTORABLE_SCREENS.has(urlScreen) && urlScreen !== 'menu') {
      // Only restore if there's a save to load
      const hasSave = !!loadGame(0);
      if (hasSave) {
        // Load state from localStorage first, then set to the URL screen
        const save = loadGame(0);
        if (save) {
          useGameStore.setState({
            ...save.state,
            screen: urlScreen,
            previousScreen: null,
            currentPoemScore: null,
          });
        }
      }
    }
  }, [searchParams]);

  // Sync screen state to URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const currentUrlScreen = params.get('s');
    if (screen !== 'menu' && currentUrlScreen !== screen) {
      navigate({ to: `/versecraft?s=${screen}`, replace: true });
    } else if (screen === 'menu' && currentUrlScreen) {
      navigate({ to: '/versecraft', replace: true });
    }
  }, [screen, navigate]);

  // Track playtime every second
  useEffect(() => {
    const interval = setInterval(incrementPlaytime, 1000);
    return () => clearInterval(interval);
  }, [incrementPlaytime]);

  // Auto-save before unload
  useEffect(() => {
    const handler = () => {
      if (gameStarted) triggerAutoSave();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [gameStarted, triggerAutoSave]);

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
      case 'world_setup':
        return <WorldSetup />;
      case 'dialogue':
        return mode === 'generated' ? <GeneratedDialogueScreen /> : <DialogueScreen />;
      case 'gen_poem':
        return <GeneratedPoemMoment />;
      case 'cast':
        return <CastScreen />;
      case 'complete':
        return <CompletionScreen />;
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
      case 'progress':
        return <ProgressScreen />;
      default:
        return <MainMenu />;
    }
  }, [screen, mode]);

  return (
    <div
      className="relative w-full min-h-[100dvh] overflow-hidden select-none"
      style={{
        backgroundColor: '#1a1520',
        color: '#e8e0d0',
        fontFamily: 'var(--font-nunito, var(--font-inter, sans-serif))',
      }}
    >
      {/* Back to builds — only on the menu, so it never collides with in-screen
          back buttons or the dialogue HUD on mobile. */}
      {screen === 'menu' && (
        <Link
          to="/builds"
          className="absolute top-4 left-4 z-50 flex items-center gap-1.5 px-3 py-2 rounded text-xs transition-all hover:brightness-125"
          style={{
            backgroundColor: 'rgba(26, 21, 32, 0.8)',
            border: '1px solid rgba(196, 163, 90, 0.15)',
            color: '#a89888',
            backdropFilter: 'blur(4px)',
          }}
        >
          <span style={{ color: '#c4a35a' }}>&larr;</span>
          {t("back-to-builds", { defaultValue: "Back to Builds" })}
        </Link>
      )}
      {renderScreen()}
    </div>
  );
}
