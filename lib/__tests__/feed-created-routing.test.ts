import { describe, expect, it } from 'vitest';
import { feedEventBus, type FeedSSEEvent } from '../feed-sse';

const ev = (): FeedSSEEvent => ({
  type: 'rmhark.created',
  rmharkId: 'p1',
  payload: { id: 'p1' },
  timestamp: new Date().toISOString(),
  authorId: 'author',
});

describe('publishCreatedPost routing', () => {
  function listen() {
    const global: FeedSSEEvent[] = [];
    const own: FeedSSEEvent[] = [];
    const other: FeedSSEEvent[] = [];
    const un = [
      feedEventBus.subscribeCreated((e) => global.push(e)),
      feedEventBus.subscribeUser('author', (e) => own.push(e)),
      feedEventBus.subscribeUser('someone-else', (e) => other.push(e)),
    ];
    return { global, own, other, stop: () => un.forEach((u) => u()) };
  }

  it('broadcasts a PUBLIC non-community post globally', () => {
    const l = listen();
    feedEventBus.publishCreatedPost(ev(), { audience: 'PUBLIC', communityId: null });
    l.stop();
    expect(l.global).toHaveLength(1);
    expect(l.own).toHaveLength(0);
  });

  it.each([
    ['FOLLOWERS', null],
    ['PRIVATE', null],
    ['CIRCLE', null],
    ['SUPPORTERS', null],
    ['PUBLIC', 'c1'],
  ])('keeps a %s post (community %s) off the global channel, author only', (audience, communityId) => {
    const l = listen();
    feedEventBus.publishCreatedPost(ev(), { audience, communityId });
    l.stop();
    expect(l.global).toHaveLength(0);
    expect(l.own).toHaveLength(1);
    expect(l.other).toHaveLength(0);
  });
});
