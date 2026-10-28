import { describe, expect, it } from 'vitest';
import { discordNotifier, withFiles } from '../discord';

// A message with a file is multipart (payload_json + files[n]); without one it
// is the plain JSON call it always was.
describe('withFiles', () => {
  it('is plain JSON without files', () => {
    const init = withFiles({ method: 'POST', headers: { authorization: 'Bot t' } }, { content: 'hi' });
    expect(init.headers).toEqual({ authorization: 'Bot t', 'content-type': 'application/json' });
    expect(init.body).toBe('{"content":"hi"}');
    expect(withFiles({ method: 'POST', headers: {} }, { content: 'hi' }, []).body).toBe('{"content":"hi"}');
  });

  it('is multipart with the file and an attachments list, leaving content-type to fetch', async () => {
    const init = withFiles({ method: 'POST', headers: { authorization: 'Bot t' } }, { content: 'hi' }, [{ name: 'r.txt', content: 'line one\nline two' }]);
    expect(init.headers).toEqual({ authorization: 'Bot t' });
    const form = init.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(JSON.parse(form.get('payload_json') as string)).toEqual({ content: 'hi', attachments: [{ id: 0, filename: 'r.txt' }] });
    const file = form.get('files[0]') as File;
    expect(file.name).toBe('r.txt');
    expect(await file.text()).toBe('line one\nline two');
  });
});

describe('discordNotifier with files', () => {
  it('uploads the file to the bot endpoint and returns the message id', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const notifier = discordNotifier({
      botToken: 'tok',
      channelId: 'C1',
      fetchImpl: (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response(JSON.stringify({ id: 'm9' }), { status: 200 });
      }) as typeof fetch,
    });
    const id = await notifier.post({ content: 'x', allowed_mentions: { parse: [] } }, [{ name: 'r.txt', content: 'body' }]);
    expect(id).toBe('m9');
    expect(calls[0]!.url).toContain('/channels/C1/messages');
    expect(calls[0]!.init.body).toBeInstanceOf(FormData);
    expect((calls[0]!.init.headers as Record<string, string>)['content-type']).toBeUndefined();
  });

  it('falls back to the webhook with the file when the bot post fails', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const notifier = discordNotifier({
      botToken: 'tok',
      channelId: 'C1',
      fallbackWebhookUrl: 'https://hooks.example/w',
      log: () => {},
      fetchImpl: (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response(null, { status: url.includes('hooks.example') ? 200 : 500 });
      }) as typeof fetch,
    });
    await notifier.post({ content: 'x', allowed_mentions: { parse: [] } }, [{ name: 'r.txt', content: 'body' }]);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.url).toBe('https://hooks.example/w');
    expect(calls[1]!.init.body).toBeInstanceOf(FormData);
  });
});
