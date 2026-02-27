/**
 * RMHbox — History Display Registrations (Phase 5 Minigames)
 *
 * Registers the history display configurations for
 * Rhyme Time, Undercover Agent, Category Crash, Wiki-Race,
 * Minimalist Masterpiece, Emoji Cinema, and Wit-War.
 *
 * Reference: docs/rmhbox/design-spec/core.md §14A.5
 */

import { registerHistoryDisplay } from './history-display-registry';
import type { GameLog } from './history-display-registry';

import RhymeTimeHistoryDetail from '@/components/rmhbox/minigames/rhyme-time/RhymeTimeHistoryDetail';
import UndercoverAgentHistoryDetail from '@/components/rmhbox/minigames/undercover-agent/UndercoverAgentHistoryDetail';
import CategoryCrashHistoryDetail from '@/components/rmhbox/minigames/category-crash/CategoryCrashHistoryDetail';
import WikiRaceHistoryDetail from '@/components/rmhbox/minigames/wiki-race/WikiRaceHistoryDetail';
import MinimalistMasterpieceHistoryDetail from '@/components/rmhbox/minigames/minimalist-masterpiece/MinimalistMasterpieceHistoryDetail';
import EmojiCinemaHistoryDetail from '@/components/rmhbox/minigames/emoji-cinema/EmojiCinemaHistoryDetail';
import WitWarHistoryDetail from '@/components/rmhbox/minigames/wit-war/WitWarHistoryDetail';

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
      options: (log: GameLog) => {
        const endAction = log.actions.find((a) => a.type === 'game_end');
        const condition = endAction?.payload.winCondition as string | undefined;
        return condition ? [condition] : [];
      },
    },
    {
      key: 'winningTeam',
      label: 'Winning Team',
      type: 'select',
      options: (log: GameLog) => {
        const endAction = log.actions.find((a) => a.type === 'game_end');
        const team = endAction?.payload.winningTeam as string | undefined;
        return team ? [team] : [];
      },
    },
    {
      key: 'startingTeam',
      label: 'Starting Team',
      type: 'select',
      options: (log: GameLog) => {
        const team = log.initialState.startingTeam as string | undefined;
        return team ? [team] : [];
      },
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
      key: 'roundCount',
      label: 'Rounds Played',
      type: 'select',
      options: (log: GameLog) => [
        String(log.actions.filter((a) => a.type === 'round_start').length),
      ],
    },
  ],
  getSummary: (log: GameLog) => {
    const rounds = log.actions.filter((a) => a.type === 'round_start');
    if (rounds.length === 0) return 'Wiki-Race game';
    const pairs = rounds.map(
      (r) => `${r.payload.startArticle ?? '?'} → ${r.payload.targetArticle ?? '?'}`,
    );
    if (pairs.length === 1) return pairs[0];
    return `${pairs.length} rounds — ${pairs.join(', ')}`;
  },
});

// ─── Minimalist Masterpiece ──────────────────────────────────────

registerHistoryDisplay({
  minigameId: 'minimalist-masterpiece',
  DetailComponent: MinimalistMasterpieceHistoryDetail,
  searchableFields: [
    {
      key: 'prompts',
      label: 'Prompts',
      extract: (log: GameLog) =>
        log.actions
          .filter((a) => a.type === 'round_start')
          .map((a) => a.payload.promptText as string)
          .filter(Boolean),
    },
  ],
  filterableFields: [
    { key: 'auctionWin', label: 'Won Auction', type: 'boolean' },
    { key: 'roundCount', label: 'Rounds Played', type: 'range', valuePath: 'roundsPlayed' },
  ],
  getSummary: (log: GameLog) => {
    const prompts = log.actions
      .filter((a) => a.type === 'round_start')
      .map((a) => a.payload.promptText as string)
      .filter(Boolean);
    if (prompts.length === 0) return 'Minimalist Masterpiece game';
    if (prompts.length === 1) return `Prompt: "${prompts[0]}"`;
    return `${prompts.length} rounds — ${prompts.join(', ')}`;
  },
});

// ─── Emoji Cinema ────────────────────────────────────────────────

registerHistoryDisplay({
  minigameId: 'emoji-cinema',
  DetailComponent: EmojiCinemaHistoryDetail,
  searchableFields: [
    {
      key: 'movieTitles',
      label: 'Movie Titles',
      extract: (log: GameLog) => {
        // Movie titles from movie_selected or round_end actions
        const fromSelected = log.actions
          .filter((a) => a.type === 'movie_selected')
          .map((a) => a.payload.movieTitle as string);
        const fromRoundEnd = log.actions
          .filter((a) => a.type === 'round_end')
          .map((a) => a.payload.movieTitle as string);
        return [...new Set([...fromSelected, ...fromRoundEnd])].filter(Boolean);
      },
    },
    {
      key: 'guesses',
      label: 'Guesses',
      extract: (log: GameLog) =>
        log.actions
          .filter((a) => a.type === 'submit_guess')
          .map((a) => a.payload.guess as string)
          .filter(Boolean),
    },
    {
      key: 'emojiSequences',
      label: 'Emoji Sequences',
      extract: (log: GameLog) =>
        log.actions
          .filter((a) => a.type === 'round_end')
          .flatMap((a) => {
            const seq = a.payload.emojiSequence;
            return Array.isArray(seq) ? (seq as string[]) : [];
          }),
    },
  ],
  filterableFields: [
    { key: 'wasCreator', label: 'Was Creator', type: 'boolean' },
    { key: 'guessedCorrectly', label: 'Guessed Correctly', type: 'boolean' },
    {
      key: 'roundCount',
      label: 'Rounds Played',
      type: 'range',
      valuePath: 'roundsPlayed',
    },
  ],
  getSummary: (log: GameLog) => {
    const movies = log.actions
      .filter((a) => a.type === 'movie_selected')
      .map((a) => a.payload.movieTitle as string)
      .filter(Boolean);
    if (movies.length === 0) {
      const rounds = log.actions.filter((a) => a.type === 'round_start');
      return `${rounds.length} rounds — Movie emoji challenge`;
    }
    return `${movies.length} rounds — ${movies.join(', ')}`;
  },
});

// ─── Wit-War ─────────────────────────────────────────────────────

registerHistoryDisplay({
  minigameId: 'wit-war',
  DetailComponent: WitWarHistoryDetail,
  searchableFields: [
    {
      key: 'prompts',
      label: 'Prompts',
      extract: (log: GameLog) =>
        log.actions
          .filter((a) => a.type === 'matchup_resolved')
          .map((a) => a.payload.prompt as string)
          .filter(Boolean),
    },
    {
      key: 'answers',
      label: 'Answers',
      extract: (log: GameLog) =>
        log.actions
          .filter((a) => a.type === 'matchup_resolved')
          .flatMap((a) => [a.payload.answerA as string, a.payload.answerB as string])
          .filter(Boolean),
    },
  ],
  filterableFields: [
    { key: 'hadQuiplash', label: 'Had Quiplash', type: 'boolean' },
    { key: 'matchupWins', label: 'Matchup Wins', type: 'range', valuePath: 'matchupWins' },
  ],
  getSummary: (log: GameLog) => {
    const matchups = log.actions.filter((a) => a.type === 'matchup_resolved');
    const quiplashes = matchups.filter((a) => a.payload.isQuiplash);
    return `${matchups.length} matchups — ${quiplashes.length} quiplash${quiplashes.length !== 1 ? 'es' : ''}`;
  },
});
