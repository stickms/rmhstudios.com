// lib/dream-rift/store.ts
import { create } from 'zustand';
import type { GameScreen, Difficulty, Character, PlayerState } from './types';
import {
  LIVES_START, BOMBS_START, PLAYER_START_X, PLAYER_START_Y,
  CHARACTER_STATS, POWER_MAX,
} from './constants';

export interface DreamRiftState {
  screen: GameScreen;
  difficulty: Difficulty;
  character: Character;
  stage: number;
  player: PlayerState;
  totalScore: number;
  continues: number;

  setScreen: (screen: GameScreen) => void;
  selectCharacter: (character: Character) => void;
  selectDifficulty: (difficulty: Difficulty) => void;
  startGame: () => void;
  resetPlayer: () => void;
  playerDeath: () => void;
  addScore: (points: number) => void;
  addPower: (amount: number) => void;
  addGraze: () => void;
  nextStage: () => void;
  useBomb: () => boolean;
  useContinue: () => boolean;
}

function makeInitialPlayer(character: Character): PlayerState {
  const stats = CHARACTER_STATS[character];
  return {
    id: 0,
    position: { x: PLAYER_START_X, y: PLAYER_START_Y },
    velocity: { x: 0, y: 0 },
    active: true,
    sprite: `player_${character}`,
    character,
    lives: LIVES_START,
    bombs: BOMBS_START,
    power: 0,
    graze: 0,
    score: 0,
    hiScore: 0,
    focused: false,
    invulnFrames: 0,
    deathbombWindow: 0,
    meleeCooldown: 0,
    specialCooldown: 0,
    dashCooldown: 0,
    hitboxRadius: stats.hitboxRadius,
  };
}

export const useDreamRiftStore = create<DreamRiftState>((set, get) => ({
  screen: 'title',
  difficulty: 'normal',
  character: 'rei',
  stage: 1,
  player: makeInitialPlayer('rei'),
  totalScore: 0,
  continues: 0,

  setScreen: (screen) => set({ screen }),
  selectCharacter: (character) => set({ character, player: makeInitialPlayer(character) }),
  selectDifficulty: (difficulty) => set({ difficulty }),

  startGame: () => {
    const { character } = get();
    set({
      screen: 'playing',
      stage: 1,
      player: makeInitialPlayer(character),
      totalScore: 0,
      continues: 0,
    });
  },

  resetPlayer: () => {
    const { character } = get();
    set({ player: makeInitialPlayer(character) });
  },

  playerDeath: () => set((s) => {
    const newLives = s.player.lives - 1;
    if (newLives < 0) {
      return { screen: 'gameOver' as const };
    }
    return {
      player: {
        ...s.player,
        lives: newLives,
        bombs: Math.max(s.player.bombs, BOMBS_START),
        power: Math.max(0, s.player.power - 16),
        position: { x: PLAYER_START_X, y: PLAYER_START_Y },
        invulnFrames: 120,
      },
    };
  }),

  addScore: (points) => set((s) => ({
    player: { ...s.player, score: s.player.score + points },
    totalScore: s.totalScore + points,
  })),

  addPower: (amount) => set((s) => ({
    player: { ...s.player, power: Math.min(POWER_MAX, s.player.power + amount) },
  })),

  addGraze: () => set((s) => ({
    player: { ...s.player, graze: s.player.graze + 1, score: s.player.score + 500 },
  })),

  nextStage: () => set((s) => ({
    stage: s.stage + 1,
    screen: s.stage >= 6 ? 'stageResult' as const : 'playing' as const,
  })),

  useBomb: () => {
    const { player } = get();
    if (player.bombs <= 0) return false;
    set((s) => ({
      player: { ...s.player, bombs: s.player.bombs - 1, invulnFrames: 180 },
    }));
    return true;
  },

  useContinue: () => {
    const s = get();
    const maxContinues = s.difficulty === 'easy' ? 5 : s.difficulty === 'normal' ? 3 : s.difficulty === 'hard' ? 1 : 0;
    if (s.continues >= maxContinues) return false;
    set({
      continues: s.continues + 1,
      player: makeInitialPlayer(s.character),
      screen: 'playing' as const,
    });
    return true;
  },
}));
