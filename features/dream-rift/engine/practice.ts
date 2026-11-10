/**
 * Spell practice bookkeeping (local storage only). A card becomes practicable
 * once a real run has met it; practice attempts never touch scores or boards.
 */
export type PracticeBoss = 'mid' | 'boss';
export interface PracticeTarget {
  stage: number;
  boss: PracticeBoss;
  card: number;
}
export interface PracticeOutcome extends PracticeTarget {
  captured: boolean;
  reason: 'captured' | 'timeout' | 'died';
}
interface PracticeData {
  reached: Record<string, 1>;
  stats: Record<string, { attempts: number; captures: number }>;
}

const KEY = 'dr.practice.v1';
export const practiceId = (t: PracticeTarget): string => `${t.stage}.${t.boss}.${t.card}`;

export function loadPractice(): PracticeData {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as PracticeData | null;
    if (raw && typeof raw === 'object')
      return { reached: raw.reached ?? {}, stats: raw.stats ?? {} };
  } catch {
    /* storage blocked or corrupt */
  }
  return { reached: {}, stats: {} };
}

function save(d: PracticeData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* storage blocked */
  }
}

export function recordReached(t: PracticeTarget): void {
  const d = loadPractice();
  const id = practiceId(t);
  if (d.reached[id]) return;
  d.reached[id] = 1;
  save(d);
}

export function recordAttempt(o: PracticeOutcome): void {
  const d = loadPractice();
  const id = practiceId(o);
  const s = d.stats[id] ?? { attempts: 0, captures: 0 };
  s.attempts++;
  if (o.captured) s.captures++;
  d.stats[id] = s;
  save(d);
}
