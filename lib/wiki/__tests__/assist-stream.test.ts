import { afterEach, describe, expect, it, vi } from 'vitest';
import { streamWikiAssist, WikiAssistError } from '@/lib/wiki/assist-stream';

/** An event-stream response delivered in exactly the given network chunks. */
function sse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    { headers: { 'Content-Type': 'text/event-stream' } },
  );
}
const frame = (payload: unknown) => `data: ${JSON.stringify(payload)}\n\n`;
const body = { instruction: 'Write it', title: 'T', content: '' };

const fetchMock = vi.fn();
const run = async (res: Response) => {
  fetchMock.mockResolvedValue(res);
  vi.stubGlobal('fetch', fetchMock);
  const deltas: string[] = [];
  await streamWikiAssist(body, (d) => deltas.push(d));
  return deltas;
};

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe('streamWikiAssist', () => {
  it('posts the instruction and page to the assist endpoint', async () => {
    await run(sse(['data: [DONE]\n\n']));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/admin/wiki/assist');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual(body);
  });

  it('delivers each delta in order and stops at [DONE]', async () => {
    const deltas = await run(
      sse([
        frame({ delta: '## A' }),
        frame({ delta: '\n\ntext' }),
        'data: [DONE]\n\n',
        frame({ delta: 'late' }),
      ]),
    );
    expect(deltas).toEqual(['## A', '\n\ntext']);
  });

  it('reassembles frames split across network chunks, multi-byte characters included', async () => {
    const whole = frame({ delta: 'café ☕' }) + frame({ delta: ' ok' }) + 'data: [DONE]\n\n';
    const bytes = new TextEncoder().encode(whole);
    const pieces: string[] = [];
    fetchMock.mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            for (let i = 0; i < bytes.length; i += 3) controller.enqueue(bytes.slice(i, i + 3));
            controller.close();
          },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    await streamWikiAssist(body, (d) => pieces.push(d));
    expect(pieces.join('')).toBe('café ☕ ok');
  });

  it('ends cleanly when the stream closes without [DONE]', async () => {
    await expect(run(sse([frame({ delta: 'x' })]))).resolves.toEqual(['x']);
  });

  it('rejects with the code from an in-band error frame, keeping what came before', async () => {
    fetchMock.mockResolvedValue(
      sse([frame({ delta: 'partial' }), frame({ error: 'AI_UNAVAILABLE' })]),
    );
    vi.stubGlobal('fetch', fetchMock);
    const deltas: string[] = [];
    const err = await streamWikiAssist(body, (d) => deltas.push(d)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WikiAssistError);
    expect((err as WikiAssistError).code).toBe('AI_UNAVAILABLE');
    expect(deltas).toEqual(['partial']);
  });

  it.each([
    [new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }), 'Forbidden'],
    [
      new Response(JSON.stringify({ code: 'RATE_LIMITED', error: 'x' }), { status: 429 }),
      'RATE_LIMITED',
    ],
    [new Response('<html>bad gateway</html>', { status: 502 }), 'http_502'],
  ])('rejects a refused request with its code', async (res, code) => {
    const err = await run(res).catch((e: unknown) => e);
    expect((err as WikiAssistError).code).toBe(code);
  });
});
