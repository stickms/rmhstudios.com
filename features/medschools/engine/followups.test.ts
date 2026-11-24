import { describe, expect, it } from 'vitest';
import { buildFollowupInput, parseFollowups } from './followups';

describe('buildFollowupInput', () => {
  it('cleans, caps and dedupes the examples and drops the question itself', () => {
    const stored = Array.from({ length: 20 }, (_, i) => `Example question ${i}?`);
    const i = buildFollowupInput({
      question: 'Why medicine? https://x.example',
      notes: '  my notes @handle ',
      stored: ['Why medicine?', ...stored, stored[0]!],
    });
    expect(i.question).toBe('Why medicine?');
    expect(i.notes).toBe('my notes');
    expect(i.examples).toHaveLength(8);
    expect(i.examples).not.toContain('Why medicine?');
  });
  it('omits empty notes', () => {
    expect('notes' in buildFollowupInput({ question: 'Why medicine?', notes: '   ', stored: [] })).toBe(false);
  });
});

describe('parseFollowups', () => {
  const ok = {
    followups: [
      'What drew you to that?',
      'How did you handle the setback?',
      'Who helped you most?',
      'A fourth one here?',
    ],
  };
  it('keeps at most three questions', () => {
    expect(parseFollowups(ok, 'Why medicine?')).toHaveLength(3);
  });
  it('drops answers, links, repeats, the question itself and odd lengths', () => {
    const r = parseFollowups(
      {
        followups: [
          'You should say you love people.',
          'See https://x.example for more?',
          'Why medicine?',
          'What drew you to that?',
          'What drew you to that??',
          'hm?',
          'x'.repeat(300) + '?',
          'Who inspired you?',
        ],
      },
      'Why medicine',
    );
    expect(r).toEqual(['What drew you to that?', 'Who inspired you?']);
  });
  it('is null when fewer than two survive or the shape is wrong', () => {
    expect(parseFollowups({ followups: ['What drew you to that?'] }, 'q')).toBeNull();
    expect(parseFollowups({ followups: 'x' }, 'q')).toBeNull();
    expect(parseFollowups(null, 'q')).toBeNull();
    expect(parseFollowups('text', 'q')).toBeNull();
  });
});
