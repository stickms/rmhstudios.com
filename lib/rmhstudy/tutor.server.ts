/**
 * RMHStudy AI tutor (#31). Generates flashcards from a topic and answers study
 * questions, using the configured DeepSeek key. Server-only.
 */

import OpenAI from 'openai';

const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || 'missing',
  baseURL: 'https://api.deepseek.com/v1',
  maxRetries: 1,
});
const MODEL = process.env.RMHARK_AI_MODEL || 'deepseek-chat';

export function isTutorConfigured(): boolean {
  return Boolean(process.env.DEEPSEEK_API_KEY);
}

export interface GeneratedCard {
  front: string;
  back: string;
}

/** Generate up to `count` flashcards for a topic. Returns [] on failure. */
export async function generateCards(topic: string, count = 8): Promise<GeneratedCard[]> {
  if (!isTutorConfigured()) return [];
  try {
    const res = await deepseek.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You generate study flashcards. Return ONLY a JSON array of objects with "front" (a question/term) and "back" (a concise answer). No prose, no code fences. Keep each side under 200 characters.',
        },
        { role: 'user', content: `Make ${count} flashcards about: ${topic}` },
      ],
      max_tokens: 1200,
      temperature: 0.6,
      stream: false,
    });
    const text = res.choices[0]?.message?.content?.trim() ?? '[]';
    const json = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((c) => c && typeof c.front === 'string' && typeof c.back === 'string')
      .slice(0, count)
      .map((c) => ({ front: String(c.front).slice(0, 500), back: String(c.back).slice(0, 500) }));
  } catch (err) {
    console.error('[tutor] generateCards failed:', err);
    return [];
  }
}

/** Answer a study question (tutor mode). Returns a short explanation. */
export async function tutorAnswer(question: string): Promise<string> {
  if (!isTutorConfigured()) return 'The AI tutor is not configured right now.';
  try {
    const res = await deepseek.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You are a friendly, concise study tutor. Explain clearly in 2-5 sentences, use a simple example when helpful, and avoid filler.',
        },
        { role: 'user', content: question },
      ],
      max_tokens: 400,
      temperature: 0.5,
      stream: false,
    });
    return res.choices[0]?.message?.content?.trim() || 'I could not answer that — try rephrasing.';
  } catch (err) {
    console.error('[tutor] answer failed:', err);
    return 'The tutor could not respond just now. Try again.';
  }
}
