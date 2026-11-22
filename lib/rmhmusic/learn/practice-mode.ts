/**
 * Learning mode or Test mode — the one setting every RMH Music drill reads.
 *
 *   learning  A wrong answer is shown (what was played, where it sits against the right note) and
 *             the same question stays until it is answered right. The miss still counts: the
 *             question is graded `again` and is not scored as right.
 *   test      One answer per question, right or wrong, then on to the next — as the drills always
 *             were. This is the mode the Daily board and its scored run are fixed to.
 *
 * Kept on the device (like the light/dark choice), not in the profile: it is a preference about how
 * to practise right now, not part of who the learner is.
 */
import { persisted } from '@/lib/core/persist';

export type PracticeMode = 'learning' | 'test';

export const PRACTICE_MODES: readonly PracticeMode[] = ['learning', 'test'];

export const DEFAULT_PRACTICE_MODE: PracticeMode = 'learning';

export const PRACTICE_MODE_STORAGE_KEY = 'rmhmusic-practice-mode';

export function isPracticeMode(v: unknown): v is PracticeMode {
  return v === 'learning' || v === 'test';
}

const store = persisted<PracticeMode>({
  key: PRACTICE_MODE_STORAGE_KEY,
  fallback: DEFAULT_PRACTICE_MODE,
  validate: (v) => (isPracticeMode(v) ? v : undefined),
});

let current: PracticeMode | null = null;
const listeners = new Set<() => void>();

/** The stored mode (the default on the server and when storage is blocked). */
export function getPracticeMode(): PracticeMode {
  if (current === null) current = typeof window === 'undefined' ? DEFAULT_PRACTICE_MODE : store.read();
  return current;
}

export function setPracticeMode(mode: PracticeMode): void {
  if (!isPracticeMode(mode)) return;
  current = mode;
  store.write(mode);
  for (const l of listeners) l();
}

export function subscribePracticeMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
