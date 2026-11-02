import { afterEach, describe, expect, it } from 'vitest';
import { MAX_CHAT_LENGTH, sanitizeChatText } from '../chat';
import { __resetChat, chatHistory, deleteChatMessage, postChatMessage, subscribeChat } from '../chat.server';
import { parseEmbed, parseFeaturedStreams } from '../streams';

describe('sanitizeChatText', () => {
  it('trims, collapses whitespace and strips invisible/bidi characters', () => {
    expect(sanitizeChatText('  hello \n\n  world‮  ')).toEqual({ ok: true, text: 'hello world' });
    expect(sanitizeChatText('a​b\u0000c')).toEqual({ ok: true, text: 'abc' });
  });
  it('collapses character walls', () => {
    expect(sanitizeChatText('wooooooooooow')).toEqual({ ok: true, text: 'wooow' });
  });
  it('rejects empty and over-long text', () => {
    expect(sanitizeChatText('   ​ ')).toEqual({ ok: false, reason: 'empty' });
    expect(sanitizeChatText('x y '.repeat(MAX_CHAT_LENGTH))).toEqual({ ok: false, reason: 'too-long' });
  });
  it.each([
    'check https://example.com',
    'go to www.results-now.com',
    'vote at fake-election.gov now',
    'results at example dot com',
    'join t.me/scam',
    'bit.ly/abc',
    'results.vote today',
  ])('rejects links: %s', (t) => {
    expect(sanitizeChatText(t)).toEqual({ ok: false, reason: 'links' });
  });
  it.each(['Pa. is going to be close', 'U.S. Senate looks tight', 'D+3.1 with 95% in', 'lol 3.5 pts', 'e.g. maybe'])(
    'allows normal talk: %s',
    (t) => {
      expect(sanitizeChatText(t).ok).toBe(true);
    },
  );
});

describe('chat room', () => {
  afterEach(() => __resetChat());
  const author = { userId: 'u1', name: 'Ann', handle: 'ann', image: null };

  it('keeps history exactly once per message and fans out to subscribers', () => {
    const seen: string[] = [];
    subscribeChat('2026-11-03', (e) => e.type === 'msg' && seen.push(e.msg.text));
    postChatMessage('2026-11-03', author, 'one');
    postChatMessage('2026-11-03', author, 'two');
    expect(seen).toEqual(['one', 'two']);
    expect(chatHistory('2026-11-03').map((m) => m.text)).toEqual(['one', 'two']);
    expect(chatHistory('2028-11-07')).toEqual([]);
  });

  it('caps history and honours deletes', () => {
    const first = postChatMessage('r', author, 'm0');
    for (let i = 1; i < 130; i++) postChatMessage('r', author, `m${i}`);
    const h = chatHistory('r');
    expect(h).toHaveLength(100);
    expect(h[0].text).toBe('m30');
    deleteChatMessage('r', h[5].id);
    expect(chatHistory('r')).toHaveLength(99);
    expect(first.id).toBeTruthy();
  });
});

describe('parseEmbed', () => {
  it('builds YouTube embeds from the id, not the pasted string', () => {
    const e = parseEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=evil&t=5')!;
    expect(e.kind).toBe('youtube');
    expect(e.src('x')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0');
    expect(parseEmbed('https://youtu.be/dQw4w9WgXcQ')?.id).toBe('dQw4w9WgXcQ');
    expect(parseEmbed('https://www.youtube.com/live/dQw4w9WgXcQ')?.id).toBe('dQw4w9WgXcQ');
  });
  it('builds Twitch channel and video embeds with a validated parent', () => {
    const c = parseEmbed('https://www.twitch.tv/SomeChannel')!;
    expect(c.src('rmhstudios.com')).toBe('https://player.twitch.tv/?channel=somechannel&parent=rmhstudios.com&autoplay=true');
    expect(c.src('evil.com/x"><script>')).toContain('parent=localhost');
    expect(parseEmbed('https://www.twitch.tv/videos/123456789')?.src('a.com')).toContain('video=v123456789');
  });
  it('rejects everything else', () => {
    for (const bad of [
      'https://vimeo.com/123',
      'https://example.com/a.mp4',
      'javascript:alert(1)',
      'https://www.youtube.com/@handle',
      'https://www.twitch.tv/directory/game/x',
      'not a url',
      'https://evil.com/?u=https://youtube.com/watch?v=dQw4w9WgXcQ',
    ]) {
      expect(parseEmbed(bad)).toBeNull();
    }
    expect(parseEmbed('x'.repeat(400))).toBeNull();
  });
});

describe('parseFeaturedStreams', () => {
  it('keeps only valid, labelled, embeddable entries', () => {
    const raw = JSON.stringify([
      { label: 'Good', url: 'https://www.twitch.tv/somechannel' },
      { label: 'Bad url', url: 'https://example.com' },
      { label: '', url: 'https://www.twitch.tv/other' },
      { url: 'x' },
      null,
    ]);
    expect(parseFeaturedStreams(raw)).toEqual([{ label: 'Good', url: 'https://www.twitch.tv/somechannel' }]);
    expect(parseFeaturedStreams('nope')).toEqual([]);
    expect(parseFeaturedStreams(undefined)).toEqual([]);
  });
});
