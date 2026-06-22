import { describe, it, expect, beforeEach, vi } from 'vitest';

const { imagesMock } = vi.hoisted(() => ({ imagesMock: vi.fn() }));
vi.mock('openai', () => ({
  default: vi.fn(function () {
    return { images: { generate: imagesMock } };
  }),
}));

const { promptMock } = vi.hoisted(() => ({ promptMock: vi.fn() }));
vi.mock('@/lib/rmhark-ai/generate.server', () => ({ generateImagePrompt: promptMock }));

const { budgetMock } = vi.hoisted(() => ({ budgetMock: vi.fn() }));
vi.mock('@/lib/rmhark-ai/image-budget.server', () => ({ tryConsumeImageBudget: budgetMock }));

const { putObjectMock } = vi.hoisted(() => ({ putObjectMock: vi.fn() }));
vi.mock('@/lib/storage/s3.server', () => ({ putObject: putObjectMock }));

import { isImageGenConfigured, generatePostImage } from '@/lib/rmhark-ai/image.server';

// 12 bytes starting with the PNG magic signature so validateImageBuffer/detectImageExt pass.
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
function pngArrayBuffer(): ArrayBuffer {
  return PNG.buffer.slice(PNG.byteOffset, PNG.byteOffset + PNG.byteLength);
}

beforeEach(() => {
  imagesMock.mockReset();
  promptMock.mockReset();
  budgetMock.mockReset();
  putObjectMock.mockReset();
  process.env.XAI_API_KEY = 'xai-test';
  delete process.env.XAI_IMAGE_ENABLED;
  promptMock.mockResolvedValue('a calm mountain lake at dawn');
  budgetMock.mockResolvedValue(true);
  putObjectMock.mockResolvedValue(undefined);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, arrayBuffer: async () => pngArrayBuffer() })),
  );
});

describe('isImageGenConfigured', () => {
  it('false without a key', () => {
    delete process.env.XAI_API_KEY;
    expect(isImageGenConfigured()).toBe(false);
  });
  it('false when disabled by kill switch', () => {
    process.env.XAI_IMAGE_ENABLED = 'false';
    expect(isImageGenConfigured()).toBe(false);
  });
  it('true with a key and not disabled', () => {
    expect(isImageGenConfigured()).toBe(true);
  });
});

describe('generatePostImage', () => {
  it('returns null when unconfigured (no budget spent)', async () => {
    delete process.env.XAI_API_KEY;
    expect(await generatePostImage({ text: 'hi', userId: 'u1' })).toBeNull();
    expect(budgetMock).not.toHaveBeenCalled();
  });

  it('returns a feed image url under the user-id prefix on success', async () => {
    imagesMock.mockResolvedValueOnce({ data: [{ url: 'https://img.x.ai/abc.jpg' }] });
    const url = await generatePostImage({ text: 'lake day', userId: 'user42' });
    expect(url).toMatch(/^\/api\/feed\/image\/user42-/);
    expect(putObjectMock).toHaveBeenCalledTimes(1);
  });

  it('returns null and skips the paid call when over budget', async () => {
    budgetMock.mockResolvedValueOnce(false);
    expect(await generatePostImage({ text: 'x', userId: 'u1' })).toBeNull();
    expect(imagesMock).not.toHaveBeenCalled();
    expect(putObjectMock).not.toHaveBeenCalled();
  });

  it('returns null on an xAI error (nothing stored)', async () => {
    imagesMock.mockRejectedValueOnce(new Error('xai 500'));
    expect(await generatePostImage({ text: 'x', userId: 'u1' })).toBeNull();
    expect(putObjectMock).not.toHaveBeenCalled();
  });

  it('returns null when the downloaded bytes are not a valid image', async () => {
    imagesMock.mockResolvedValueOnce({ data: [{ url: 'https://img.x.ai/abc.jpg' }] });
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
    });
    expect(await generatePostImage({ text: 'x', userId: 'u1' })).toBeNull();
    expect(putObjectMock).not.toHaveBeenCalled();
  });
});
