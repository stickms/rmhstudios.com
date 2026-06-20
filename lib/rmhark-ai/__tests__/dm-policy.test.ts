import { describe, it, expect } from 'vitest';
import {
  needsReactiveReply,
  canBotMessage,
  decideInitiation,
  formatDmHistory,
} from '@/lib/rmhark-ai/dm-policy';

const BOT = 'bot-1';
const HUMAN = 'human-1';
const at = (ms: number) => ({ senderId: HUMAN, createdAt: new Date(ms) });

describe('needsReactiveReply', () => {
  it('is false for an empty conversation', () => {
    expect(needsReactiveReply([], BOT)).toBe(false);
  });
  it('is true when the human spoke last', () => {
    expect(
      needsReactiveReply(
        [{ senderId: BOT, createdAt: new Date(1) }, { senderId: HUMAN, createdAt: new Date(2) }],
        BOT,
      ),
    ).toBe(true);
  });
  it('is false when the bot already replied last', () => {
    expect(
      needsReactiveReply(
        [{ senderId: HUMAN, createdAt: new Date(1) }, { senderId: BOT, createdAt: new Date(2) }],
        BOT,
      ),
    ).toBe(false);
  });
});

describe('canBotMessage', () => {
  it('blocks NONE', () => {
    expect(canBotMessage({ dmPrivacy: 'NONE', humanFollowsBot: true })).toBe(false);
  });
  it('allows FOLLOWERS only when the human follows the bot', () => {
    expect(canBotMessage({ dmPrivacy: 'FOLLOWERS', humanFollowsBot: true })).toBe(true);
    expect(canBotMessage({ dmPrivacy: 'FOLLOWERS', humanFollowsBot: false })).toBe(false);
  });
  it('allows EVERYONE', () => {
    expect(canBotMessage({ dmPrivacy: 'EVERYONE', humanFollowsBot: false })).toBe(true);
  });
});

describe('decideInitiation', () => {
  const base = { botId: BOT, now: 1_000_000, followupSilenceMs: 1000 };
  it('opens when there is no conversation', () => {
    expect(decideInitiation({ ...base, messages: null })).toBe('opener');
    expect(decideInitiation({ ...base, messages: [] })).toBe('opener');
  });
  it('skips when the human has ever replied', () => {
    expect(
      decideInitiation({
        ...base,
        messages: [{ senderId: BOT, createdAt: new Date(0) }, at(5)],
      }),
    ).toBe('skip');
  });
  it('follows up once enough silence has passed after a lone opener', () => {
    expect(
      decideInitiation({ ...base, messages: [{ senderId: BOT, createdAt: new Date(0) }] }),
    ).toBe('followup');
  });
  it('skips a lone opener that is still within the silence window', () => {
    expect(
      decideInitiation({ ...base, messages: [{ senderId: BOT, createdAt: new Date(999_500) }] }),
    ).toBe('skip');
  });
  it('gives up after two unanswered bot messages', () => {
    expect(
      decideInitiation({
        ...base,
        messages: [
          { senderId: BOT, createdAt: new Date(0) },
          { senderId: BOT, createdAt: new Date(1) },
        ],
      }),
    ).toBe('skip');
  });
});

describe('formatDmHistory', () => {
  it('labels messages from the bot perspective, preserving order', () => {
    expect(
      formatDmHistory(
        [
          { senderId: HUMAN, content: 'hey' },
          { senderId: BOT, content: 'hi there' },
        ],
        BOT,
      ),
    ).toEqual([
      { from: 'them', text: 'hey' },
      { from: 'you', text: 'hi there' },
    ]);
  });
});
