import { useTranslation } from 'react-i18next';
import { useSliceItStore } from '@/lib/slice-it/store';
import type { Difficulty } from '@/lib/slice-it/types';

/**
 * The four pressings: EZ NM HD EX, each with the share of the chart's notes it
 * plays. Per-difficulty note counts would need every chart fetched for every row,
 * so this shows the share, which is what the difficulty actually changes.
 *
 * Shared by the sleeve's record and the phone's compact one, so the two cannot
 * drift into disagreeing about what a pressing is.
 */
const PRESSINGS: readonly [Difficulty, string, string][] = [
  ['easy', 'EZ', '70%'],
  ['normal', 'NM', '100%'],
  ['hard', 'HD', '150%'],
  ['expert', 'EX', '200%'],
];

export function Pressings({ className }: { className?: string }) {
  const { t } = useTranslation('c-game');
  const modifiers = useSliceItStore((s) => s.modifiers);
  const setModifiers = useSliceItStore((s) => s.setModifiers);

  return (
    <div className={className ? `slice-press-row ${className}` : 'slice-press-row'}>
      {PRESSINGS.map(([difficulty, code, pct]) => (
        <button
          key={difficulty}
          type="button"
          className="slice-press"
          aria-pressed={modifiers.difficulty === difficulty}
          aria-label={t('notes-pct-named', {
            defaultValue: '{{name}}, {{pct}} notes',
            name: difficulty,
            pct,
          })}
          onClick={() => setModifiers({ ...modifiers, difficulty })}
        >
          <span>{code}</span>
          <span className="slice-press__big">{pct}</span>
        </button>
      ))}
    </div>
  );
}
