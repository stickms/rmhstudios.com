import { describe, it, expect } from 'vitest';
import { consecutiveBotDepth, shouldReplyToMention } from '@/lib/rmhark-ai/mention-policy';

describe('consecutiveBotDepth', () => {
  it('counts the leading run of bot authors from the thread tip', () => {
    expect(consecutiveBotDepth([true, true, false, true])).toBe(2);
  });
  it('is 0 when the tip author is human', () => {
    expect(consecutiveBotDepth([false, true, true])).toBe(0);
  });
  it('is 0 for an empty thread', () => {
    expect(consecutiveBotDepth([])).toBe(0);
  });
  it('counts an all-bot chain fully', () => {
    expect(consecutiveBotDepth([true, true, true])).toBe(3);
  });
});

describe('shouldReplyToMention', () => {
  it('always replies to a human mention regardless of depth', () => {
    expect(
      shouldReplyToMention({ actorIsBot: false, botChainDepth: 99, maxBotMentionDepth: 3 }),
    ).toBe(true);
  });
  it('replies to a bot mention below the depth cap', () => {
    expect(
      shouldReplyToMention({ actorIsBot: true, botChainDepth: 2, maxBotMentionDepth: 3 }),
    ).toBe(true);
  });
  it('stops a bot mention at the depth cap', () => {
    expect(
      shouldReplyToMention({ actorIsBot: true, botChainDepth: 3, maxBotMentionDepth: 3 }),
    ).toBe(false);
  });
});
