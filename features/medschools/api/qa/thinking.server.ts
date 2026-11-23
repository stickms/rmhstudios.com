/**
 * Whether members may ask the Q&A to think it through (plan R20): `MEDSCHOOLS_QA_THINKING`, default on. Read per call so a
 * restart is not needed to switch it; an invalid value means off and is logged once.
 */
import { qaThinkingEnabled } from '../../ai-budget';

const warned = new Set<string>();
const warnOnce = (line: string): void => {
  if (warned.has(line)) return;
  warned.add(line);
  console.warn(`[medschools-qa] ${line}`);
};

export const thinkingAvailable = (env: Record<string, string | undefined> = process.env): boolean =>
  qaThinkingEnabled(env.MEDSCHOOLS_QA_THINKING, warnOnce);
