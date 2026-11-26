/**
 * Human Keyboard server-rendered pieces (the repo's component tests render to a string): the
 * sentence with typed, next and untyped letters told apart by weight and underline, the letter
 * pad with 44 px keys and only the player's own letters, and the history detail.
 */
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import type { HistoryDetailProps } from '@/lib/rmhbox/history-display-registry';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) =>
      String(o?.defaultValue ?? k).replace(/\{\{(\w+)\}\}/g, (_, v) => String(o?.[v] ?? '')),
  }),
}));

const { default: SentenceLine } = await import('../SentenceLine');
const { default: LetterPad } = await import('../LetterPad');
const { default: HumanKeyboardHistoryDetail } = await import('../HumanKeyboardHistoryDetail');

describe('SentenceLine', () => {
  const html = renderToString(<SentenceLine text="we win" cursor={3} />);

  it('tells typed, next and untyped letters apart by weight and underline, never by colour alone', () => {
    // "we " is typed (3 characters, the space included): semibold, no underline
    expect(html.match(/font-semibold/g)).toHaveLength(2);
    // The next letter has the heavy underline
    expect(html.match(/decoration-4/g)).toHaveLength(1);
    // The rest is regular weight with a thin underline
    expect(html.match(/decoration-1/g)).toHaveLength(2);
    expect(html).not.toMatch(/font-semibold[^"]*underline/);
  });

  it('reads the sentence once for a screen reader and hides the letters', () => {
    expect(html).toContain('The sentence: we win. 2 of 5 letters typed.');
    expect(html.match(/aria-hidden="true"/g)).toHaveLength(2);
  });

  it('keeps a word in one block so a line never breaks inside it', () => {
    expect(html.match(/whitespace-nowrap/g)).toHaveLength(2);
  });
});

describe('LetterPad', () => {
  it('shows only the letters it is given, each a 44 px target', () => {
    const html = renderToString(<LetterPad letters={['a', 'k', 'z']} enabled onPress={() => {}} dealKey={1} />);
    expect(html.match(/<button/g)).toHaveLength(3);
    expect(html.match(/size-11/g)).toHaveLength(3);
    expect(html).toContain('aria-label="Letter k"');
    expect(html).not.toContain('aria-label="Letter b"');
    // Five columns of 44 px keys and 8 px gaps are 252 px wide: inside a 390 px phone
    expect(html).toContain('grid-cols-5');
  });

  it('says so when the player holds nothing', () => {
    const html = renderToString(<LetterPad letters={[]} enabled onPress={() => {}} dealKey={1} />);
    expect(html).toContain('You hold no letters right now');
    expect(html).not.toContain('<button');
  });

  it('marks the keys disabled when presses are not accepted', () => {
    const html = renderToString(<LetterPad letters={['a']} enabled={false} onPress={() => {}} dealKey={1} />);
    expect(html).toContain('aria-disabled="true"');
  });
});

describe('HumanKeyboardHistoryDetail', () => {
  const props: HistoryDetailProps = {
    currentUserId: 'u1',
    players: [
      { userId: 'u1', userName: 'Ann', rank: 1, score: 900 },
      { userId: 'u2', userName: 'Ben', rank: 2, score: 400 },
    ],
    gameLog: {
      minigameId: 'human-keyboard',
      version: 1,
      lobbyId: 'L1',
      startedAt: 0,
      endedAt: 1,
      players: [],
      initialState: {},
      finalResults: [],
      actions: [
        { seq: 1, type: 'round_start', payload: { roundIndex: 0, sentenceId: 'hk-proverb-01' }, timestamp: 0 },
        {
          seq: 2,
          type: 'round_result',
          payload: {
            roundIndex: 0,
            sentenceId: 'hk-proverb-01',
            sentence: 'a stitch in time saves nine',
            completed: true,
            elapsedMs: 41_250,
            results: [
              { userId: 'u1', correct: 14, wrong: 0, points: 900 },
              { userId: 'u2', correct: 9, wrong: 2, points: 400 },
            ],
          },
          timestamp: 1,
        },
      ],
    } as unknown as HistoryDetailProps['gameLog'],
  };

  it('renders each round sentence, time and every player presses', () => {
    const html = renderToString(<HumanKeyboardHistoryDetail {...props} />);
    expect(html).toContain('a stitch in time saves nine');
    expect(html).toContain('Finished in 41.3 s');
    expect(html).toContain('14 correct, 0 wrong');
    expect(html).toContain('9 correct, 2 wrong');
    expect(html).toContain('Final scores');
  });

  it('says a round was not finished', () => {
    const log = structuredClone(props.gameLog);
    (log.actions[1]!.payload as Record<string, unknown>).completed = false;
    const html = renderToString(<HumanKeyboardHistoryDetail {...props} gameLog={log} />);
    expect(html).toContain('Not finished');
  });
});
