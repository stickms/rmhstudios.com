/**
 * The room quiz (s11-15): a short multiple-choice quiz the host runs on a deck during a break. Pure and client-safe:
 * the state machine (question, reveal, end), the public view of a question (never the answer), tallying and standings.
 * Nothing here touches a socket, a timer or the database; the hub owns the timers and the quiz lives in the room's
 * memory and ends with it. The server marks every answer with `scoreQuestion`; a client only ever sees the answer in
 * the reveal.
 */
import { buildTest, scoreQuestion, availableKinds, factCount } from '@/lib/study/practice-test';
import type { MultipleChoiceQuestion, TestCard } from '@/lib/study/practice-test';

export const QUIZ_COUNTS = [5, 10, 15] as const;
export type QuizCount = (typeof QUIZ_COUNTS)[number];
/** Most questions held in memory for one room. */
export const MAX_QUIZ_QUESTIONS = 15;
/** Time to answer one question. */
export const QUESTION_MS = 20_000;
/** How long the answer stays up before the next question. */
export const REVEAL_MS = 5_000;
/** The remaining seconds at which a screen reader is told how long is left (not every second). */
export const TIME_ANNOUNCE_AT = [10, 5] as const;

export type QuizPhase = 'question' | 'reveal' | 'ended';

/** A question as the server holds it: it carries the answer, so it never leaves the server. */
export type QuizQuestion = Pick<MultipleChoiceQuestion, 'kind' | 'cardId' | 'prompt' | 'options' | 'answerIndex'>;

/** What every member is sent while a question is open: no answer, no card id. */
export interface PublicQuestion {
  deckTitle: string;
  /** 0-based position and the number of questions. */
  index: number;
  total: number;
  prompt: string;
  options: string[];
  /** Epoch ms the answers close. */
  deadline: number;
  durationMs: number;
}

export interface Standing {
  userId: string;
  userName: string;
  score: number;
  /** Ties share a place: 1, 1, 3. */
  place: number;
}

export interface RevealView {
  index: number;
  total: number;
  answerIndex: number;
  /** How many members chose each option. */
  counts: number[];
  /** Members who answered this question correctly. */
  correctUserIds: string[];
  standings: Standing[];
  /** Whether another question follows. */
  last: boolean;
}

export interface EndView {
  deckTitle: string;
  total: number;
  standings: Standing[];
}

/** What a member is sent when they join or reconnect mid-quiz (or `null` when no quiz runs). */
export interface QuizSnapshot {
  phase: QuizPhase;
  question: PublicQuestion;
  /** The viewer's own choice on the open question; null if they have not answered or may not. */
  myChoice: number | null;
  /** Whether the viewer was present when this question opened (a late joiner watches it). */
  canAnswer: boolean;
  reveal: RevealView | null;
  standings: Standing[];
}

export interface QuizState {
  deckTitle: string;
  questions: QuizQuestion[];
  /** Index of the current question. */
  index: number;
  phase: QuizPhase;
  deadline: number;
  /** Members present when the current question opened: only they may answer it (a late joiner watches). */
  eligible: Set<string>;
  answers: Map<string, number>;
  scores: Map<string, { userName: string; score: number }>;
  lastReveal: RevealView | null;
}

export type AnswerResult = 'accepted' | 'ignored';

/** Why a deck cannot be quizzed, or null when it can. The cards passed in are the text-only ones. */
export type QuizDeckProblem = 'too-few-answers' | 'empty';

export function quizDeckProblem(cards: readonly TestCard[]): QuizDeckProblem | null {
  if (cards.length === 0) return 'empty';
  return availableKinds(cards, 'back', factCount(cards))['multiple-choice'].available ? null : 'too-few-answers';
}

export function isQuizCount(n: unknown): n is QuizCount {
  return typeof n === 'number' && (QUIZ_COUNTS as readonly number[]).includes(n);
}

/**
 * The questions for one quiz: multiple choice only, built by the practice-test builder (so a deck needs four distinct
 * answers), as many as the deck's facts allow up to `count`. Returns `[]` when the deck cannot be quizzed.
 */
export function buildQuizQuestions(cards: readonly TestCard[], count: number, seed: number): QuizQuestion[] {
  if (quizDeckProblem(cards) !== null) return [];
  const wanted = Math.min(Math.max(1, Math.floor(count)), MAX_QUIZ_QUESTIONS);
  return buildTest(cards, { count: wanted, kinds: ['multiple-choice'], direction: 'back' }, seed)
    .filter((q): q is MultipleChoiceQuestion => q.kind === 'multiple-choice')
    .slice(0, MAX_QUIZ_QUESTIONS)
    .map((q) => ({ kind: q.kind, cardId: q.cardId, prompt: q.prompt, options: q.options, answerIndex: q.answerIndex }));
}

/** A quiz with its first question open; `present` are the members in the room now. */
export function createQuiz(
  deckTitle: string,
  questions: readonly QuizQuestion[],
  present: Iterable<string>,
  now: number,
): QuizState {
  return {
    deckTitle,
    questions: questions.slice(0, MAX_QUIZ_QUESTIONS),
    index: 0,
    phase: 'question',
    deadline: now + QUESTION_MS,
    eligible: new Set(present),
    answers: new Map(),
    scores: new Map(),
    lastReveal: null,
  };
}

/** The open question as every member sees it. Never carries the answer or the card. */
export function publicQuestion(quiz: QuizState): PublicQuestion {
  const q = quiz.questions[Math.min(quiz.index, quiz.questions.length - 1)];
  return {
    deckTitle: quiz.deckTitle,
    index: quiz.index,
    total: quiz.questions.length,
    prompt: q?.prompt ?? '',
    options: q ? [...q.options] : [],
    deadline: quiz.deadline,
    durationMs: QUESTION_MS,
  };
}

/** One answer. A second answer, a late one, one from a member who joined after the question opened: ignored. */
export function submitAnswer(
  quiz: QuizState,
  userId: string,
  userName: string,
  choice: unknown,
  now: number,
): AnswerResult {
  if (quiz.phase !== 'question' || now >= quiz.deadline) return 'ignored';
  if (!quiz.eligible.has(userId) || quiz.answers.has(userId)) return 'ignored';
  const q = quiz.questions[quiz.index];
  if (!q || typeof choice !== 'number' || !Number.isInteger(choice) || choice < 0 || choice >= q.options.length) {
    return 'ignored';
  }
  quiz.answers.set(userId, choice);
  // A member appears in the standings from their first answer.
  if (!quiz.scores.has(userId)) quiz.scores.set(userId, { userName, score: 0 });
  return 'accepted';
}

/** Whether everyone who may answer and is still here has. */
export function allAnswered(quiz: QuizState, present: Iterable<string>): boolean {
  const here = new Set(present);
  const waiting = [...quiz.eligible].filter((id) => here.has(id));
  return waiting.length > 0 && waiting.every((id) => quiz.answers.has(id));
}

/** Standings by score, ties sharing a place (1, 1, 3); equal scores are listed by name. */
export function standings(quiz: Pick<QuizState, 'scores'>): Standing[] {
  const rows = [...quiz.scores.entries()]
    .map(([userId, v]) => ({ userId, userName: v.userName, score: v.score }))
    .sort((a, b) => b.score - a.score || a.userName.localeCompare(b.userName) || a.userId.localeCompare(b.userId));
  return rows.map((row, i) => {
    const first = rows.findIndex((r) => r.score === row.score);
    return { ...row, place: (i === first ? i : first) + 1 };
  });
}

/** Close the question: mark every answer on the server, tally the choices and open the reveal. */
export function reveal(quiz: QuizState): RevealView {
  const q = quiz.questions[quiz.index];
  const counts = (q?.options ?? []).map(() => 0);
  const correct: string[] = [];
  if (q && quiz.phase === 'question') {
    for (const [userId, choice] of quiz.answers) {
      counts[choice] = (counts[choice] ?? 0) + 1;
      const marked = scoreQuestion({ ...q }, { kind: 'multiple-choice', choice });
      if (marked.points > 0) {
        correct.push(userId);
        const entry = quiz.scores.get(userId);
        if (entry) entry.score += marked.points;
      }
    }
    quiz.phase = 'reveal';
  } else if (quiz.lastReveal) {
    return quiz.lastReveal;
  }
  const view: RevealView = {
    index: quiz.index,
    total: quiz.questions.length,
    answerIndex: q?.answerIndex ?? 0,
    counts,
    correctUserIds: correct,
    standings: standings(quiz),
    last: quiz.index >= quiz.questions.length - 1,
  };
  quiz.lastReveal = view;
  return view;
}

/** After a reveal: open the next question, or end. Returns the new phase. */
export function advance(quiz: QuizState, present: Iterable<string>, now: number): QuizPhase {
  if (quiz.phase === 'ended') return 'ended';
  if (quiz.index >= quiz.questions.length - 1) {
    quiz.phase = 'ended';
    return 'ended';
  }
  quiz.index += 1;
  quiz.phase = 'question';
  quiz.deadline = now + QUESTION_MS;
  quiz.eligible = new Set(present);
  quiz.answers = new Map();
  quiz.lastReveal = null;
  return 'question';
}

/** End the quiz now (the host stopped it, a work phase began, the host left): the standings so far. */
export function endQuiz(quiz: QuizState): EndView {
  quiz.phase = 'ended';
  return { deckTitle: quiz.deckTitle, total: quiz.questions.length, standings: standings(quiz) };
}

/** A member who was kicked or banned is out of the quiz as they are out of the room. */
export function removeFromQuiz(quiz: QuizState, userId: string): void {
  quiz.eligible.delete(userId);
  quiz.answers.delete(userId);
  quiz.scores.delete(userId);
}

/** What a member who joins or reconnects is sent: the open question (their own answer only) or the reveal. */
export function snapshotFor(quiz: QuizState, userId: string): QuizSnapshot {
  return {
    phase: quiz.phase,
    question: publicQuestion(quiz),
    myChoice: quiz.answers.get(userId) ?? null,
    canAnswer: quiz.eligible.has(userId),
    reveal: quiz.phase === 'reveal' ? quiz.lastReveal : null,
    standings: standings(quiz),
  };
}
