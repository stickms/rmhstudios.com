import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  flash: vi.fn(),
  reasoning: vi.fn(),
}));

vi.mock('@/lib/ai/provider.server', async (orig) => ({
  ...(await orig<object>()),
  isAiConfigured: () => true,
  runTaskJson: h.flash,
  runReasoningTask: h.reasoning,
}));
vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));
vi.mock('@/lib/rmhark-ai/image.server', () => ({
  generatePostImage: vi.fn(),
  isImageGenConfigured: () => false,
}));

import { designEmail, designModels } from '@/lib/email/ai.server';

const design = {
  theme: 'light',
  accent: 'ink',
  logo: true,
  preheader: 'Preview',
  blocks: [{ type: 'heading', text: 'Hello' }, { type: 'text', text: 'Body' }, { type: 'divider' }],
};
const input = {
  subject: 'Subject',
  body: 'Body',
  category: 'announcements' as const,
  imageCount: 0,
};

describe('DeepSeek flash and reasoning designers', () => {
  beforeEach(() => {
    h.flash.mockReset().mockResolvedValue(design);
    h.reasoning.mockReset().mockResolvedValue(`\`\`\`json\n${JSON.stringify(design)}\n\`\`\``);
  });

  it('offers both when DeepSeek is configured', () => {
    expect(designModels()).toMatchObject({ deepseek: true, 'deepseek-reasoning': true });
  });

  it('flash uses the chat route, never the reasoning model', async () => {
    expect(await designEmail({ ...input, model: 'deepseek' })).not.toBeNull();
    expect(h.flash).toHaveBeenCalledOnce();
    expect(h.reasoning).not.toHaveBeenCalled();
  });

  it('reasoning calls the reasoning model with the detailed brief and a large budget', async () => {
    expect(await designEmail({ ...input, model: 'deepseek-reasoning' })).not.toBeNull();
    expect(h.flash).not.toHaveBeenCalled();
    const [, model, , user, opts] = h.reasoning.mock.calls[0]!;
    expect(model).toBe('deepseek-flash');
    expect(user).toContain('Work in detail');
    expect(opts.maxTokens).toBeGreaterThanOrEqual(8_000);
  });
});
