/**
 * RMHbox — History Display Registrations (Phase 5 Minigames)
 *
 * Registers the history display configurations for
 * Rhyme Time, Undercover Agent, Category Crash, and Wiki-Race.
 *
 * Reference: docs/rmhbox/design-spec/core.md §14A.5
 */

import { registerHistoryDisplay } from './history-display-registry';
import type { GameLog } from './history-display-registry';

import RhymeTimeHistoryDetail from '@/components/rmhbox/minigames/rhyme-time/RhymeTimeHistoryDetail';
import UndercoverAgentHistoryDetail from '@/components/rmhbox/minigames/undercover-agent/UndercoverAgentHistoryDetail';
import CategoryCrashHistoryDetail from '@/components/rmhbox/minigames/category-crash/CategoryCrashHistoryDetail';
import WikiRaceHistoryDetail from '@/components/rmhbox/minigames/wiki-race/WikiRaceHistoryDetail';

// ─── Rhyme Time ──────────────────────────────────────────────────

registerHistoryDisplay({
  minigameId: 'rhyme-time',
  DetailComponent: RhymeTimeHistoryDetail,
  searchableFields: [
    {
      key: 'rootWords',
      label: 'Root Words',
      extract: (log: GameLog) =>
        log.actions
          .filter((a) => a.type === 'round_start')
          .map((a) => a.payload.rootWord as string)
          .filter(Boolean),
    },
    {
      key: 'submissions',
      label: 'Submissions',
      extract: (log: GameLog) =>
        log.actions
          .filter((a) => a.type === 'submission')
          .map((a) => a.payload.word as string)
          .filter(Boolean),
    },
  ],
  filterableFields: [
    { key: 'roundCount', label: 'Rounds Played', type: 'range', valuePath: 'roundCount' },
    { key: 'hadSpeedBonus', label: 'Speed Bonus Awarded', type: 'boolean' },
  ],
  getSummary: (log: GameLog) => {
    const rounds = log.actions.filter((a) => a.type === 'round_start');
    const rootWords = rounds.map((r) => r.payload.rootWord).join(', ');
    return `${rounds.length} rounds — ${rootWords}`;
  },
});

// ─── Undercover Agent ────────────────────────────────────────────

registerHistoryDisplay({
  minigameId: 'undercover-agent',
  DetailComponent: UndercoverAgentHistoryDetail,
  searchableFields: [
    {
      key: 'clues',
      label: 'Clues Given',
      extract: (log: GameLog) =>
        log.actions
          .filter((a) => a.type === 'clue_given')
          .map((a) => a.payload.word as string)
          .filter(Boolean),
    },
    {
      key: 'gridWords',
      label: 'Grid Words',
      extract: (log: GameLog) => {
        const words = log.initialState.words;
        return Array.isArray(words) ? (words as string[]) : [];
      },
    },
  ],
  filterableFields: [
    {
      key: 'winCondition',
      label: 'Win Condition',
      type: 'select',
      options: () => ['all_found', 'assassin', 'stalemate'],
    },
    {
      key: 'team',
      label: 'Your Team',
      type: 'select',
      options: () => ['A', 'B'],
    },
    {
      key: 'role',
      label: 'Your Role',
      type: 'select',
      options: () => ['spymaster', 'operative'],
    },
  ],
  getSummary: (log: GameLog) => {
    const endAction = log.actions.find((a) => a.type === 'game_end');
    const winner = (endAction?.payload.winningTeam as string) ?? 'Unknown';
    const condition = (endAction?.payload.winCondition as string) ?? '';
    return `Team ${winner} wins (${condition.replace(/_/g, ' ')})`;
  },
});

// ─── Category Crash ──────────────────────────────────────────────

registerHistoryDisplay({
  minigameId: 'category-crash',
  DetailComponent: CategoryCrashHistoryDetail,
  searchableFields: [
    {
      key: 'categories',
      label: 'Categories',
      extract: (log: GameLog) =>
        log.actions
          .filter((a) => a.type === 'round_start')
          .flatMap((a) => (a.payload.categories as string[]) ?? []),
    },
    {
      key: 'answers',
      label: 'Answers',
      extract: (log: GameLog) =>
        log.actions
          .filter((a) => a.type === 'answers_locked')
          .flatMap((a) => {
            const answers = a.payload.answers as Array<{ answer: string }> | undefined;
            return answers?.map((ans) => ans.answer) ?? [];
          }),
    },
  ],
  filterableFields: [
    {
      key: 'letter',
      label: 'Starting Letter',
      type: 'select',
      options: (log: GameLog) =>
        log.actions
          .filter((a) => a.type === 'round_start')
          .map((a) => a.payload.letter as string)
          .filter(Boolean),
    },
    { key: 'crashCount', label: 'Crashes Received', type: 'range', valuePath: 'crashCount' },
  ],
  getSummary: (log: GameLog) => {
    const rounds = log.actions.filter((a) => a.type === 'round_start');
    const letters = rounds.map((r) => r.payload.letter).join(', ');
    return `${rounds.length} rounds — Letters: ${letters}`;
  },
});

// ─── Wiki-Race ───────────────────────────────────────────────────

registerHistoryDisplay({
  minigameId: 'wiki-race',
  DetailComponent: WikiRaceHistoryDetail,
  searchableFields: [
    {
      key: 'articles',
      label: 'Articles Visited',
      extract: (log: GameLog) =>
        log.actions
          .filter((a) => a.type === 'navigate')
          .map((a) => a.payload.toArticle as string)
          .filter(Boolean),
    },
    {
      key: 'startTarget',
      label: 'Start/Target',
      extract: (log: GameLog) =>
        log.actions
          .filter((a) => a.type === 'round_start')
          .flatMap((a) => [
            a.payload.startArticle as string,
            a.payload.targetArticle as string,
          ])
          .filter(Boolean),
    },
  ],
  filterableFields: [
    { key: 'finished', label: 'Completed Race', type: 'boolean' },
    { key: 'pathLength', label: 'Path Length', type: 'range', valuePath: 'pathLength' },
    {
      key: 'round',
      label: 'Round Number',
      type: 'select',
      options: (log: GameLog) =>
        log.actions
          .filter((a) => a.type === 'round_start')
          .map((a) => String(a.payload.round)),
    },
  ],
  getSummary: (log: GameLog) => {
    const start = log.actions.find((a) => a.type === 'round_start');
    return `${start?.payload.startArticle ?? '?'} → ${start?.payload.targetArticle ?? '?'}`;
  },
});
