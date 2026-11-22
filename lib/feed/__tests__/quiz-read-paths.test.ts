/**
 * Quiz polls (sprint 07 #19): the answer is secret until earned, on EVERY path that returns a poll. A source scan,
 * like QUIET_COUNT_READ_PATHS and GIF_ALT_READ_PATHS: the registry names the files, the scan holds them to it, and a
 * new poll read has to be listed, listed as never-the-answer, or excluded here with a reason.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { QUIZ_NEVER_PATHS, QUIZ_READ_PATHS } from '@/lib/feed/quiz-poll';

const ROOT = join(__dirname, '..', '..', '..');
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = join(dir, name);
    const abs = join(ROOT, rel);
    if (statSync(abs).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue;
      walk(rel, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(relative(ROOT, abs));
    }
  }
  return out;
}

/** What marks a file as reading the poll of a post (the RMHarkPoll table or one of its serialisers). */
const READS_A_POLL =
  /rMHarkPoll\b|pollLifecycleView|rankedPollFields|pollOptionCount|serializePostPoll|\.poll\??\.options|poll:\s*\{\s*(include|select)/;

/**
 * Files the scan matches that are neither read paths nor never-paths, each with the reason. Chat polls
 * (chat-plus, group chat, direct messages, calendar polls) are a different feature and out of scope.
 */
const EXCLUDED: Record<string, string> = {
  'lib/feed/poll-lifecycle.ts': 'pure end/extend rules and the lifecycle view; carries no answer',
  'lib/feed/ranked-poll.ts': 'pure ranked-poll rules; ranked and quiz polls are mutually exclusive',
  'lib/feed/ranked-poll.server.ts': 'ranked ballots only; a quiz is never ranked',
  'lib/feed/ranked-result.server.ts': 'the instant-runoff count of a ranked poll; a quiz is never ranked',
  'lib/scheduled/publish.server.ts': 'writes the poll of a scheduled post (and the quiz answer); returns no poll',
  'lib/social/engagement.server.ts': 'writes the poll of an API post (and the quiz answer); returns only the post id',
  'lib/feed/quiz-poll.ts': 'the rule itself',
};
const OUT_OF_SCOPE = /^lib\/(chat-plus|group-chat|messages|calendar)\//;

describe('QUIZ_READ_PATHS', () => {
  it('lists real files with no duplicates', () => {
    expect(new Set(QUIZ_READ_PATHS).size).toBe(QUIZ_READ_PATHS.length);
    for (const path of QUIZ_READ_PATHS) expect(() => read(path), path).not.toThrow();
  });

  it.each([...QUIZ_READ_PATHS])('%s applies the reveal rule', (path) => {
    expect(read(path), `${path} must route its poll through quizRevealFor / restampQuizReveal`).toMatch(
      /quizRevealFor|restampQuizReveal|stripQuizAnswer/,
    );
  });

  it('never copies the stored answer straight onto a payload', () => {
    for (const path of QUIZ_READ_PATHS) {
      expect(read(path), path).not.toMatch(
        /correctOptionId:\s*(?:poll|p|r|row|rmhark\.poll|post\.poll|createdPoll|found|option\.poll)\??\.correctOptionId/,
      );
    }
  });

  it('is never listed as never-the-answer as well', () => {
    for (const path of QUIZ_READ_PATHS) expect(QUIZ_NEVER_PATHS, path).not.toHaveProperty([path]);
  });
});

describe('QUIZ_NEVER_PATHS', () => {
  it.each(Object.entries(QUIZ_NEVER_PATHS))('%s never carries the answer (%s)', (path, reason) => {
    expect(reason.length).toBeGreaterThan(10);
    expect(read(path), `${path} must not read or return a quiz's answer`).not.toMatch(/correctOptionId|quizReveal/);
  });
});

describe('every server file that reads a poll', () => {
  const files = [...walk('lib'), ...walk('app/routes'), ...walk('server'), ...walk('features')].filter(
    (f) => !OUT_OF_SCOPE.test(f) && READS_A_POLL.test(read(f)),
  );

  it('finds the files', () => {
    expect(files.length).toBeGreaterThan(8);
  });

  it('is a read path, a never-path, or excluded with a reason', () => {
    const unaccounted = files.filter(
      (f) => !(QUIZ_READ_PATHS as readonly string[]).includes(f) && !(f in QUIZ_NEVER_PATHS) && !(f in EXCLUDED),
    );
    expect(unaccounted, 'a file reads a poll without deciding what a quiz answer does there: list it').toEqual([]);
  });

  it('keeps the exclusions honest: real files that still match, each with a reason', () => {
    for (const [path, reason] of Object.entries(EXCLUDED)) {
      expect(reason.length, path).toBeGreaterThan(10);
      expect(() => read(path), path).not.toThrow();
    }
  });
});

describe('the surfaces', () => {
  it('both feed mappers in the timeline pass the reader to the reveal rule', () => {
    const src = read('lib/feed/timeline.ts');
    expect(src.match(/mapPoll\(r\.poll, \{ viewerId: userId, authorId: r\.userId \}\)/g)?.length).toBe(2);
    expect(src).toContain('quizRevealFor');
  });

  it('profile and bookmark mappers pass the reader on every call', () => {
    for (const path of ['lib/profile/api/profile.$id.rmharks.server.ts', 'lib/bookmarks.server.ts']) {
      const src = read(path);
      const calls = src.match(/poll: mapPoll\(/g)?.length ?? 0;
      const withReader = src.match(/authorId: r\.userId/g)?.length ?? 0;
      expect(calls, path).toBeGreaterThan(0);
      expect(withReader, path).toBe(calls);
    }
  });

  it('a cached page is re-stamped per viewer after the cache', () => {
    expect(read('lib/feed/page-reconcile.server.ts')).toContain('restampQuizReveal(');
  });

  it('a new post broadcasts without the answer', () => {
    expect(read('lib/feed/api/rmharks.server.ts')).toMatch(/poll: item\.poll \? stripQuizAnswer\(item\.poll\)/);
  });

  it('the vote route refuses a second answer and reveals in its reply', () => {
    const src = read('lib/feed/api/rmharks.$id.vote.server.ts');
    expect(src).toContain('ALREADY_ANSWERED');
    expect(src).toContain('quizRevealFor(');
  });

  it('the developer API poll carries quiz, correctOptionId and explanation', () => {
    const src = read('lib/api/serializers.server.ts');
    expect(src).toContain('quiz: quiz.quiz === true');
    expect(src).toContain('correctOptionId: quiz.correctOptionId ?? null');
    expect(src).toContain('explanation: quiz.explanation ?? null');
    expect(read('app/routes/api/v1/posts/$id.ts')).toContain('quizRevealFor(');
  });

  it('OG cards, the embed, RSS and live events never read the answer', () => {
    for (const path of ['lib/og/api/og.post.$id.server.ts', 'lib/og/post-image.server.tsx', 'lib/rss.ts', 'lib/feed-sse.ts']) {
      expect(read(path), path).not.toMatch(/correctOptionId|explanation/);
    }
  });

  it('the scheduled list shows the question only', () => {
    expect(read('lib/scheduled/list.server.ts')).not.toMatch(/correctOptionId|correctIndex/);
  });

  it('poll-ended notices are built from the options as before, never from the answer', () => {
    expect(read('lib/feed/poll-lifecycle.server.ts')).not.toMatch(/correctOptionId|explanation/);
  });
});
