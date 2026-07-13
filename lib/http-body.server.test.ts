import { describe, expect, it } from 'vitest';
import { readTextBodyLimited, RequestBodyTooLargeError } from './http-body.server';

describe('bounded request body reader', () => {
  it('reads a body below the ceiling', async () => {
    const request = new Request('https://example.com', { method: 'POST', body: 'hello' });
    await expect(readTextBodyLimited(request, 5)).resolves.toBe('hello');
  });

  it('rejects a chunked body after the streamed byte ceiling', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('1234'));
        controller.enqueue(new TextEncoder().encode('5678'));
        controller.close();
      },
    });
    const request = new Request('https://example.com', {
      method: 'POST',
      body: stream,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });
    await expect(readTextBodyLimited(request, 6)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
  });
});
