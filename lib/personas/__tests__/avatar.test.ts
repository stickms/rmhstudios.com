import { describe, it, expect, beforeEach, vi } from 'vitest';

const { imagesMock } = vi.hoisted(() => ({ imagesMock: vi.fn() }));
vi.mock('openai', () => ({
  default: vi.fn(function () {
    return { images: { generate: imagesMock } };
  }),
}));

const { promptMock, configuredMock } = vi.hoisted(() => ({
  promptMock: vi.fn(),
  configuredMock: vi.fn(),
}));
vi.mock('@/lib/rmhark-ai/generate.server', () => ({
  generatePersonaAvatarPrompt: promptMock,
  isRmharkAIConfigured: configuredMock,
}));

const { budgetMock } = vi.hoisted(() => ({ budgetMock: vi.fn() }));
vi.mock('@/lib/rmhark-ai/image-budget.server', () => ({ tryConsumeImageBudget: budgetMock }));

const { putObjectMock } = vi.hoisted(() => ({ putObjectMock: vi.fn() }));
vi.mock('@/lib/storage/s3.server', () => ({ putObject: putObjectMock }));

// optimizeImage uses sharp (native); stub it to echo a webp buffer so the test
// doesn't depend on real image decoding.
const { optimizeMock } = vi.hoisted(() => ({ optimizeMock: vi.fn() }));
vi.mock('@/lib/image-optimize', () => ({ optimizeImage: optimizeMock }));

const { updateManyMock } = vi.hoisted(() => ({ updateManyMock: vi.fn() }));
vi.mock('@/lib/prisma.server', () => ({
  prisma: { aiPersona: { updateMany: updateManyMock } },
}));

import { isPersonaAvatarConfigured, generatePersonaAvatar } from '@/lib/personas/avatar.server';

// 12 bytes starting with the PNG magic signature so validateImageBuffer passes.
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
function pngArrayBuffer(): ArrayBuffer {
  return PNG.buffer.slice(PNG.byteOffset, PNG.byteOffset + PNG.byteLength);
}

const PERSONA = { name: 'Captain Vex', tagline: 'space pirate', systemPrompt: 'You are a witty space pirate.' };

beforeEach(() => {
  imagesMock.mockReset();
  promptMock.mockReset();
  configuredMock.mockReset();
  budgetMock.mockReset();
  putObjectMock.mockReset();
  optimizeMock.mockReset();
  updateManyMock.mockReset();
  process.env.XAI_API_KEY = 'xai-test';
  delete process.env.XAI_IMAGE_ENABLED;
  configuredMock.mockReturnValue(true);
  promptMock.mockResolvedValue('portrait of a roguish space pirate captain');
  budgetMock.mockResolvedValue(true);
  putObjectMock.mockResolvedValue(undefined);
  optimizeMock.mockResolvedValue({ buffer: Buffer.from([1, 2, 3]), contentType: 'image/webp' });
  updateManyMock.mockResolvedValue({ count: 1 });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, arrayBuffer: async () => pngArrayBuffer() })),
  );
});

describe('isPersonaAvatarConfigured', () => {
  it('false without a key', () => {
    delete process.env.XAI_API_KEY;
    expect(isPersonaAvatarConfigured()).toBe(false);
  });
  it('false when disabled by the kill switch', () => {
    process.env.XAI_IMAGE_ENABLED = 'false';
    expect(isPersonaAvatarConfigured()).toBe(false);
  });
  it('true with a key and not disabled', () => {
    expect(isPersonaAvatarConfigured()).toBe(true);
  });
});

describe('generatePersonaAvatar', () => {
  it('returns null when unconfigured (no budget spent)', async () => {
    delete process.env.XAI_API_KEY;
    expect(await generatePersonaAvatar('p1', PERSONA)).toBeNull();
    expect(budgetMock).not.toHaveBeenCalled();
  });

  it('stores a webp under the persona-avatar namespace and persists avatarUrl', async () => {
    imagesMock.mockResolvedValueOnce({ data: [{ url: 'https://img.x.ai/abc.jpg' }] });
    const url = await generatePersonaAvatar('persona7', PERSONA);
    expect(url).toMatch(/\/api\/personas\/avatar\/persona7-\d+\.webp$/);
    // converted to webp before upload
    expect(optimizeMock).toHaveBeenCalledWith(expect.any(Buffer), expect.objectContaining({ format: 'webp' }));
    const [key, , contentType] = putObjectMock.mock.calls[0];
    expect(key).toMatch(/^personas\/avatars\/persona7-\d+\.webp$/);
    expect(contentType).toBe('image/webp');
    expect(updateManyMock).toHaveBeenCalledWith({ where: { id: 'persona7' }, data: { avatarUrl: url } });
  });

  it('falls back to a direct prompt when DeepSeek is unconfigured', async () => {
    configuredMock.mockReturnValue(false);
    imagesMock.mockResolvedValueOnce({ data: [{ url: 'https://img.x.ai/abc.jpg' }] });
    const url = await generatePersonaAvatar('p2', PERSONA);
    expect(url).not.toBeNull();
    expect(promptMock).not.toHaveBeenCalled();
    // the direct template embeds the persona name in the image prompt
    expect(imagesMock.mock.calls[0][0].prompt).toContain('Captain Vex');
  });

  it('returns null and skips the paid call when over budget', async () => {
    budgetMock.mockResolvedValueOnce(false);
    expect(await generatePersonaAvatar('p1', PERSONA)).toBeNull();
    expect(imagesMock).not.toHaveBeenCalled();
    expect(putObjectMock).not.toHaveBeenCalled();
  });

  it('returns null on an xAI error (nothing stored or persisted)', async () => {
    imagesMock.mockRejectedValueOnce(new Error('xai 500'));
    expect(await generatePersonaAvatar('p1', PERSONA)).toBeNull();
    expect(putObjectMock).not.toHaveBeenCalled();
    expect(updateManyMock).not.toHaveBeenCalled();
  });

  it('returns null when the downloaded bytes are not a valid image', async () => {
    imagesMock.mockResolvedValueOnce({ data: [{ url: 'https://img.x.ai/abc.jpg' }] });
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
    });
    expect(await generatePersonaAvatar('p1', PERSONA)).toBeNull();
    expect(optimizeMock).not.toHaveBeenCalled();
    expect(putObjectMock).not.toHaveBeenCalled();
  });
});
