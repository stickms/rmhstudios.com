/**
 * RMHbox — History Display Registry
 *
 * Maps minigame IDs to their history display configurations.
 * Each minigame registers how to render its game log details,
 * what fields are searchable, and what fields are filterable.
 *
 * Reference: docs/rmhbox/design-spec/core.md §14A.5
 */

import type { ComponentType } from 'react';

// ─── Types ───────────────────────────────────────────────────────

export interface GameLog {
  minigameId: string;
  version: number;
  players: Array<{ userId: string; userName: string }>;
  initialState: Record<string, unknown>;
  actions: Array<{
    seq: number;
    timestamp: number;
    type: string;
    payload: Record<string, unknown>;
  }>;
  finalResults: Array<{ userId: string; userName: string; score: number; rank: number }>;
}

export interface HistoryDetailProps {
  gameLog: GameLog;
  currentUserId: string;
  players: Array<{ userId: string; userName: string; rank: number; score: number }>;
}

export interface HistorySearchField {
  key: string;
  label: string;
  /** Given a gameLog, return all searchable string values */
  extract: (gameLog: GameLog) => string[];
}

export interface HistoryFilterField {
  key: string;
  label: string;
  type: 'select' | 'range' | 'boolean';
  /** For 'select': extract available options from a gameLog */
  options?: (gameLog: GameLog) => string[];
  /** For 'range': field path to numeric value */
  valuePath?: string;
}

export interface HistoryDisplayConfig {
  /** Unique minigame ID */
  minigameId: string;

  /** React component that renders the expanded game log detail view */
  DetailComponent: ComponentType<HistoryDetailProps>;

  /** Fields from the game log that can be text-searched */
  searchableFields: HistorySearchField[];

  /** Fields that can be filtered via dropdowns or ranges */
  filterableFields: HistoryFilterField[];

  /** Function to extract a one-line summary from a game log */
  getSummary: (gameLog: GameLog) => string;
}

// ─── Registry ────────────────────────────────────────────────────

const HISTORY_DISPLAY_REGISTRY: Record<string, HistoryDisplayConfig> = {};

export function registerHistoryDisplay(config: HistoryDisplayConfig): void {
  HISTORY_DISPLAY_REGISTRY[config.minigameId] = config;
}

export function getHistoryDisplay(minigameId: string): HistoryDisplayConfig | null {
  return HISTORY_DISPLAY_REGISTRY[minigameId] ?? null;
}

export function getAllHistoryDisplays(): Record<string, HistoryDisplayConfig> {
  return { ...HISTORY_DISPLAY_REGISTRY };
}
