import { describe, it, expect, beforeEach, vi } from 'vitest';

// Capture the mocked DeepSeek call so tests can inspect prompts & set replies.
const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));
vi.mock('openai', () => ({
  default: vi.fn(function () { return { chat: { completions: { create: createMock } } }; }),
}));

import {
  generateDirectMessageReply,
  generateDirectMessageOpener,
} from '@/lib/rmhark-ai/generate.server';

const reply = (content: string) =>
  createMock.mockResolvedValueOnce({ choices: [{ message: { content } }] });

beforeEach(() => {
  createMock.mockReset();
  process.env.DEEPSEEK_API_KEY = 'test-key';
});

describe('generateDirectMessageReply', () => {
  it('puts the persona in the system prompt and the labeled transcript in the user prompt', async () => {
    reply('sounds good!');
    const out = await generateDirectMessageReply({
      persona: 'THEME: vintage synths.',
      history: [
        { from: 'them', text: 'hey do you gig?' },
        { from: 'you', text: 'sometimes' },
      ],
    });
    expect(out).toBe('sounds good!');
    const [{ messages }] = createMock.mock.calls[0];
    const system = messages.find((m: any) => m.role === 'system').content;
    const user = messages.find((m: any) => m.role === 'user').content;
    expect(system).toContain('THEME: vintage synths.');
    expect(system).toMatch(/never reveal/i);
    expect(user).toContain('Them: hey do you gig?');
    expect(user).toContain('You: sometimes');
  });

  it('clamps output to the reply char limit', async () => {
    reply('x'.repeat(900));
    const out = await generateDirectMessageReply({ persona: 'p', history: [] });
    expect(out.length).toBeLessThanOrEqual(500);
  });
});

describe('generateDirectMessageOpener', () => {
  it('asks the model to open a new conversation in persona', async () => {
    reply('hey! love your last post');
    const out = await generateDirectMessageOpener({ persona: 'THEME: trail running.' });
    expect(out).toBe('hey! love your last post');
    const [{ messages }] = createMock.mock.calls[0];
    const system = messages.find((m: any) => m.role === 'system').content;
    const user = messages.find((m: any) => m.role === 'user').content;
    expect(system).toContain('THEME: trail running.');
    expect(user).toMatch(/start a new .*conversation/i);
  });
});
