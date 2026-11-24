import { describe, expect, it } from 'vitest';
import { GENERAL_QUESTIONS, GENERAL_QUESTIONS_VERSION } from './general-questions';
import { generalQuestionsSchema } from './general-questions.schema';

describe('general questions', () => {
  it('parse with the schema and carry a version', () => {
    expect(generalQuestionsSchema.safeParse(GENERAL_QUESTIONS).success).toBe(true);
    expect(GENERAL_QUESTIONS_VERSION).toBeGreaterThanOrEqual(1);
  });
  it('have unique ids and unique text', () => {
    expect(new Set(GENERAL_QUESTIONS.map((q) => q.id)).size).toBe(GENERAL_QUESTIONS.length);
    expect(new Set(GENERAL_QUESTIONS.map((q) => q.text.toLowerCase())).size).toBe(GENERAL_QUESTIONS.length);
  });
  it('cover both programs, each with several categories', () => {
    for (const program of ['REG', 'PHD'] as const) {
      const own = GENERAL_QUESTIONS.filter((q) => q.program === program);
      expect(own.length).toBeGreaterThanOrEqual(10);
      expect(new Set(own.map((q) => q.category)).size).toBeGreaterThanOrEqual(3);
    }
  });
  it('are questions or prompts of a sensible length', () => {
    for (const q of GENERAL_QUESTIONS) {
      expect(q.text.length).toBeGreaterThanOrEqual(10);
      expect(q.text.length).toBeLessThanOrEqual(300);
      expect(q.text).toMatch(/[?.]$/);
    }
  });
  it('rejects a bad shape', () => {
    expect(generalQuestionsSchema.safeParse([{ id: 'X', program: 'MD', category: 'x', text: 'short' }]).success).toBe(
      false,
    );
  });
});

describe('general questions and the English catalog', () => {
  it('has a gq-<id> key holding exactly the text, for every question', async () => {
    const { readFileSync } = await import('node:fs');
    const en = JSON.parse(readFileSync('locales/en/medschools.json', 'utf8')) as Record<string, string>;
    for (const q of GENERAL_QUESTIONS) expect(en[`gq-${q.id}`], q.id).toBe(q.text);
  });
});
