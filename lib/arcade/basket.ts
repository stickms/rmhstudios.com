import { hashSeed } from '@/lib/arcade/seeded';

/** Laundry Sort daily basket (R17): one seeded basket per UTC day, fixed rules for everyone. */
export const BASKET_GAME = 'laundry-sort';

export interface Basket {
  day: string;
  seed: number;
  options: { difficulty: 'standard'; durationSec: 90 };
}

export function basketFor(day: string): Basket {
  return {
    day,
    seed: hashSeed(`basket:${day}`),
    options: { difficulty: 'standard', durationSec: 90 },
  };
}

/** 6x5 emoji grid: green = sorted right, red = wrong bin, yellow = missed; proportional to the run. */
export function basketGrid(d: { sorted: number; wrong: number; missed: number }): string {
  const cells = 30;
  const total = Math.max(1, d.sorted + d.wrong + d.missed);
  const green = Math.round((d.sorted / total) * cells);
  const red = Math.min(cells - green, Math.round((d.wrong / total) * cells));
  const marks = [...'🟩'.repeat(green), ...'🟥'.repeat(red)];
  while (marks.length < cells) marks.push('🟨');
  const rows: string[] = [];
  for (let i = 0; i < cells; i += 6) rows.push(marks.slice(i, i + 6).join(''));
  return rows.join('\n');
}

export function basketShareText(
  day: string,
  score: number,
  d: { sorted: number; wrong: number; missed: number; bestCombo?: number },
  url: string,
): string {
  const combo = d.bestCombo ? ` · best combo ${d.bestCombo}` : '';
  return `Laundry Sort Basket ${day}\n${score} pts${combo}\n${basketGrid(d)}\n${url}`;
}
