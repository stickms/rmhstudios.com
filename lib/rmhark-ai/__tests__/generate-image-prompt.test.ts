import { describe, it, expect, beforeEach, vi } from 'vitest';

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));
vi.mock('openai', () => ({
  default: vi.fn(function () {
    return { chat: { completions: { create: createMock } } };
  }),
}));

import { generateImagePrompt } from '@/lib/rmhark-ai/generate.server';

beforeEach(() => {
  createMock.mockReset();
  process.env.DEEPSEEK_API_KEY = 'test-key';
});

it('derives a literal SFW prompt from the post and returns the model text', async () => {
  createMock.mockResolvedValueOnce({
    choices: [{ message: { content: 'a cozy coffee shop at golden hour, warm tones' } }],
  });
  const out = await generateImagePrompt('just had the best latte downtown');
  expect(out).toContain('coffee shop');

  const [{ messages }] = createMock.mock.calls[0];
  const system = messages.find((m: any) => m.role === 'system').content;
  const user = messages.find((m: any) => m.role === 'user').content;
  // Safety rails present.
  expect(system).toMatch(/no real|celebrit|brand|logo/i);
  // Post text is folded into the user prompt.
  expect(user).toContain('best latte downtown');
});

it('clamps overly long model output', async () => {
  createMock.mockResolvedValueOnce({ choices: [{ message: { content: 'x'.repeat(500) } }] });
  const out = await generateImagePrompt('whatever');
  expect(out.length).toBeLessThanOrEqual(300);
});
