/**
 * Quiz polls (sprint 07 #19), the pure half: what a quiz may be, and who may see its answer. Client-safe: no Prisma,
 * no zod.
 *
 * A quiz is a single-choice poll with one correct option and an optional explanation, stored as
 * `RMHarkPoll.correctOptionId` / `explanation`. The answer is secret until earned: `quizRevealFor` is the one rule,
 * and every path in `QUIZ_READ_PATHS` calls it (or `restampQuizReveal`, its after-the-cache twin).
 */

export const QUIZ_MIN_OPTIONS = 2;
export const QUIZ_MAX_OPTIONS = 4;
export const QUIZ_EXPLANATION_MAX = 280;

export type QuizPollIssue =
  | 'QUIZ_MULTI_SELECT'
  | 'QUIZ_RANKED'
  | 'QUIZ_OPTION_COUNT'
  | 'QUIZ_NEEDS_ANSWER'
  | 'QUIZ_ANSWER_RANGE'
  | 'QUIZ_EXPLANATION_LENGTH'
  | 'QUIZ_FIELDS_WITHOUT_QUIZ';

/** What is wrong with a poll that asks to be a quiz (or carries quiz fields without being one); empty when valid. */
export function quizPollIssues(input: {
  quiz?: boolean | undefined;
  multiSelect?: boolean | undefined;
  ranked?: boolean | undefined;
  optionCount: number;
  correctIndex?: number | null | undefined;
  explanation?: string | null | undefined;
}): QuizPollIssue[] {
  const hasFields =
    (input.correctIndex !== undefined && input.correctIndex !== null) || (input.explanation ?? '').trim().length > 0;
  if (!input.quiz) return hasFields ? ['QUIZ_FIELDS_WITHOUT_QUIZ'] : [];
  const issues: QuizPollIssue[] = [];
  if (input.multiSelect) issues.push('QUIZ_MULTI_SELECT');
  if (input.ranked) issues.push('QUIZ_RANKED');
  if (input.optionCount < QUIZ_MIN_OPTIONS || input.optionCount > QUIZ_MAX_OPTIONS) {
    issues.push('QUIZ_OPTION_COUNT');
  }
  if (input.correctIndex === undefined || input.correctIndex === null) {
    issues.push('QUIZ_NEEDS_ANSWER');
  } else if (
    !Number.isInteger(input.correctIndex) ||
    input.correctIndex < 0 ||
    input.correctIndex >= input.optionCount
  ) {
    issues.push('QUIZ_ANSWER_RANGE');
  }
  if ((input.explanation ?? '').trim().length > QUIZ_EXPLANATION_MAX) {
    issues.push('QUIZ_EXPLANATION_LENGTH');
  }
  return issues;
}

/** The trimmed explanation to store: null when empty. */
export function normalizeExplanation(explanation: string | null | undefined): string | null {
  const t = (explanation ?? '').trim();
  return t ? t : null;
}

/** The id of the option at `correctIndex` among options in position order, or null when the index is out of range. */
export function quizAnswerOptionId(
  options: readonly { id: string; position?: number }[],
  correctIndex: number | null | undefined,
): string | null {
  if (correctIndex === undefined || correctIndex === null) return null;
  const ordered = [...options].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  return ordered[correctIndex]?.id ?? null;
}

/** What a poll payload carries about a quiz: the marker always, the answer only once earned. */
export interface QuizFields {
  quiz?: true;
  correctOptionId?: string;
  explanation?: string;
}

interface QuizPollRow {
  correctOptionId?: string | null;
  explanation?: string | null;
  closesAt?: Date | null;
  closedAt?: Date | null;
}

/** Whether the viewer's own votes (the options' `votes`, read for the viewer only) include one on this poll. */
export function viewerHasVoted(options: readonly { votes?: readonly unknown[] }[]): boolean {
  return options.some((o) => (o.votes?.length ?? 0) > 0);
}

export function isQuizPoll(poll: { correctOptionId?: string | null }): boolean {
  return !!poll.correctOptionId;
}

/** The poll has ended: the author closed it, or its end has passed (`closedAt ?? closesAt`). */
function quizEnded(poll: QuizPollRow, now: Date): boolean {
  const end = poll.closedAt ?? poll.closesAt ?? null;
  return end !== null && end.getTime() <= now.getTime();
}

/**
 * THE rule. A plain poll gets `{}`. A quiz always gets `quiz: true`; it also gets `correctOptionId` and
 * `explanation` only for its author, for a viewer who has voted on it, and for everyone once it has ended.
 */
export function quizRevealFor(
  poll: QuizPollRow,
  viewer: { viewerId: string | null; authorId: string },
  voted: boolean,
  now: Date = new Date(),
): QuizFields {
  if (!poll.correctOptionId) return {};
  const isAuthor = !!viewer.viewerId && viewer.viewerId === viewer.authorId;
  if (!(isAuthor || voted || quizEnded(poll, now))) return { quiz: true };
  return {
    quiz: true,
    correctOptionId: poll.correctOptionId,
    ...(poll.explanation ? { explanation: poll.explanation } : {}),
  };
}

/**
 * The same rule applied to a poll payload that is already built, for a cached card served to `viewerId`: the answer
 * is dropped unless the viewer is the author, has a vote on it, or the poll has ended. A cached object never decides
 * who may read the answer; this runs after the cache, on every serve.
 */
export function restampQuizReveal<
  P extends {
    quiz?: true;
    correctOptionId?: string;
    explanation?: string;
    myVotes?: string[];
    ended?: boolean;
  },
>(poll: P, viewerId: string | null, authorId: string): P {
  if (!poll.quiz || poll.correctOptionId === undefined) return poll;
  const earned = (!!viewerId && viewerId === authorId) || (poll.myVotes?.length ?? 0) > 0 || poll.ended === true;
  if (earned) return poll;
  const { correctOptionId: _answer, explanation: _why, ...rest } = poll;
  return rest as P;
}

/** A poll payload with the answer removed unconditionally: what a live event or any shared broadcast carries. */
export function stripQuizAnswer<P extends { correctOptionId?: string; explanation?: string }>(poll: P): P {
  const { correctOptionId: _answer, explanation: _why, ...rest } = poll;
  return rest as P;
}

/** The author's share of voters who chose the correct option, as a whole percent; null with no votes. */
export function quizCorrectShare(
  options: readonly { id: string; voteCount: number }[],
  correctOptionId: string,
): number | null {
  const total = options.reduce((s, o) => s + o.voteCount, 0);
  if (total <= 0) return null;
  const right = options.find((o) => o.id === correctOptionId)?.voteCount ?? 0;
  return Math.round((right / total) * 100);
}

/** What a viewer's vote on a revealed quiz amounts to. */
export function quizVerdict(
  myVotes: readonly string[] | undefined,
  correctOptionId: string,
): 'correct' | 'wrong' | null {
  if (!myVotes || myVotes.length === 0) return null;
  return myVotes.includes(correctOptionId) ? 'correct' : 'wrong';
}

/**
 * Every server file that returns a poll to somebody applies `quizRevealFor` (or `restampQuizReveal` for a cached
 * card) before the answer leaves, so it is named here. `quiz-read-paths.test.ts` reads them, and fails any other file
 * under `lib/`, `app/` or `server/` that reads an `RMHarkPoll` without being named here or in
 * `QUIZ_NEVER_PATHS`, so a new path is added on purpose.
 */
export const QUIZ_READ_PATHS = [
  'lib/feed/map-feed-item.server.ts',
  'lib/feed/timeline.ts',
  'lib/feed/page-reconcile.server.ts',
  'lib/feed/api/rmharks.server.ts',
  'lib/feed/api/rmharks.$id.server.ts',
  'lib/feed/api/rmharks.$id.vote.server.ts',
  'lib/profile/api/profile.$id.rmharks.server.ts',
  'lib/bookmarks.server.ts',
  'lib/api/serializers.server.ts',
  'app/routes/api/v1/posts/$id.ts',
] as const;

/**
 * Files that read a poll but must NEVER carry the answer (`correctOptionId`, `explanation`), each with the reason.
 * The scan fails if one of them mentions either name.
 */
export const QUIZ_NEVER_PATHS: Readonly<Record<string, string>> = {
  'lib/og/api/og.post.$id.server.ts': 'OG cards show the question and option texts, never an answer',
  'lib/og/post-image.server.tsx': 'OG cards draw the question and options, never an answer',
  'app/routes/_site/u/$userid/post/$postid.tsx': 'head() reads only the poll question',
  'app/routes/embed.post.$id.tsx': 'the embed shows the post text, no poll body and no answer',
  'lib/rss.ts': 'feeds carry post text, never an answer',
  'lib/feed-sse.ts': 'live events carry no poll answer; a client re-reads through a mapper',
  'lib/scheduled/list.server.ts': 'the scheduled list shows the question to its author, never the answer',
  'lib/feed/poll-lifecycle.server.ts': 'poll-ended notices name the leading option, never the correct one',
};
