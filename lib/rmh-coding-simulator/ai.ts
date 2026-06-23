/**
 * RMH Coding Simulator — the AI Architect.
 *
 * "ARCH-1" is an in-character RMH Studios principal architect powered by
 * DeepSeek. We reach it through the existing same-site proxy at /api/vibe/ai
 * (lib/rmhvibe/vibe-ai.server.ts), so no API key ever touches the client and the
 * call is rate-limited server-side. If the model is unavailable (no key set, a
 * network blip, a 429) we fall back to canned, on-theme one-liners so the
 * feature is always fun and never blocks gameplay.
 */

import type { ChatMessage } from './types';

const SYSTEM_PROMPT = `You are ARCH-1, a witty principal software architect at RMH Studios, an indie studio that builds games and web apps. The player is a developer grinding on the "RMH Coding Simulator" idle game. Stay fully in character: dry humor, real (but lighthearted) engineering wisdom, lots of dev culture references (rubber ducks, tech debt, "it works on my machine", Friday deploys, refactoring, code review). Keep replies SHORT — 1 to 3 punchy sentences, max ~60 words. Never break character or mention you are an AI language model. Occasionally hype the player up for shipping code.`;

/** Maps the game's chat log to the proxy's message shape (drops timestamps). */
function toApiMessages(history: ChatMessage[]): { role: string; content: string }[] {
  return history
    .filter((m) => m.role !== 'system')
    .slice(-12) // bound the context we send
    .map((m) => ({ role: m.role, content: m.content }));
}

const FALLBACK_REPLIES = [
  "Ship it. We'll fix it in post.",
  "Have you tried turning the codebase off and on again?",
  "That's not a bug, that's an undocumented feature. Write it down and call it a spec.",
  "Rule of thumb: the more interns, the more `console.log`. Embrace the chaos.",
  "Tech debt is just a loan against future-you. Future-you is furious, by the way.",
  "Refactor when it hurts. It's currently hurting. I can tell.",
  "Golden Commit incoming — keep an eye out, those merges pay rent.",
  "Remember: every Codeverse started with a single intern and a dream.",
  "Deploy on Friday. Live dangerously. (Please don't actually do that.)",
  "The keyboard is mightier than the meeting. Keep clicking.",
];

function fallback(): string {
  return FALLBACK_REPLIES[Math.floor(Math.random() * FALLBACK_REPLIES.length)]!;
}

/**
 * Ask ARCH-1 a question. Resolves to the assistant reply text. Always resolves
 * (never rejects) — on any failure it returns a themed fallback line.
 */
export async function askArchitect(history: ChatMessage[]): Promise<string> {
  try {
    const res = await fetch('/api/vibe/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system: SYSTEM_PROMPT, messages: toApiMessages(history) }),
    });
    if (!res.ok) return fallback();
    const data = (await res.json()) as { reply?: string; error?: string };
    const reply = (data.reply ?? '').trim();
    return reply || fallback();
  } catch {
    return fallback();
  }
}

/**
 * Ask ARCH-1 to generate a one-line "sprint goal" — flavor that accompanies a
 * temporary production buff. Kept separate so we can prime it with a fixed user
 * turn without polluting the visible chat log.
 */
export async function generateSprintGoal(): Promise<string> {
  const prompt: ChatMessage[] = [
    {
      role: 'user',
      content:
        'Give me a single short, punchy, funny "sprint goal" for this two-minute coding sprint. One sentence only, no preamble, no quotes.',
      at: Date.now(),
    },
  ];
  const reply = await askArchitect(prompt);
  // Trim to one tidy line.
  return reply.split('\n')[0]!.replace(/^["']|["']$/g, '').slice(0, 120);
}
