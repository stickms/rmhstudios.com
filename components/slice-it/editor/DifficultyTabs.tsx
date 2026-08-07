'use client';

/**
 * The four difficulty tabs, plus the nesting indicator.
 *
 * Design doc: `docs/slice-it-chart-editor.md` §7.1 / §7.2.
 *
 * **Not hand-rolled.** `lib/__tests__/design-consistency.test.ts` fails the build
 * on a hand-rolled tab strip, and the reason it does is that a bespoke strip
 * re-invents the roving arrow-key navigation and the `aria-selected` wiring —
 * badly, every time. `LiquidTabs` is the sanctioned primitive; the neumorphic
 * treatment comes from the `--slice-*` palette on the well it sits in
 * (`sheet={false}` hands the container back to us), not from bespoke markup.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Link2, Link2Off, TriangleAlert } from 'lucide-react';
import { LiquidTabs } from '@/components/ui/liquid-tabs';
import { Select } from '@/components/ui/select';
import { DIFFICULTIES } from '@/lib/slice-it/constants';
import { checkNesting, repairNesting, violationsByTier } from '@/lib/slice-it/editor/nesting';
import { useEditorStore } from '@/lib/slice-it/editor/store';
import type { Difficulty, NestingMode } from '@/lib/slice-it/editor/types';
import { Button } from '@/components/ui/button';

export function DifficultyTabs() {
  const { t } = useTranslation('r-slice-it');
  const charts = useEditorStore((s) => s.charts);
  const active = useEditorStore((s) => s.active);
  const setActive = useEditorStore((s) => s.setActive);
  const nestingMode = useEditorStore((s) => s.nestingMode);
  const setNestingMode = useEditorStore((s) => s.setNestingMode);
  const apply = useEditorStore((s) => s.apply);

  // Only meaningful in `warn` mode — in `cascade` the invariant cannot break, and
  // in `off` the author has said the tiers are siblings rather than a ladder.
  const violations = useMemo(
    () => (nestingMode === 'warn' ? checkNesting(charts) : []),
    [charts, nestingMode],
  );
  const perTier = useMemo(() => violationsByTier(violations), [violations]);

  const label: Record<Difficulty, string> = {
    easy: t('editor-difficulty-easy', { defaultValue: 'Easy' }),
    normal: t('editor-difficulty-normal', { defaultValue: 'Normal' }),
    hard: t('editor-difficulty-hard', { defaultValue: 'Hard' }),
    expert: t('editor-difficulty-expert', { defaultValue: 'Expert' }),
  };

  const tabs = DIFFICULTIES.map((difficulty) => ({
    id: difficulty,
    label: charts[difficulty].dirty ? `${label[difficulty]} •` : label[difficulty],
    count: charts[difficulty].notes.length,
    badge: perTier[difficulty] > 0 ? perTier[difficulty] : undefined,
    icon: perTier[difficulty] > 0 ? TriangleAlert : undefined,
  }));

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="neumorphic-inset min-w-0 flex-1 p-1.5">
        <LiquidTabs
          tabs={tabs}
          value={active}
          onChange={(id) => setActive(id as Difficulty)}
          size="sm"
          sheet={false}
          aria-label={t('editor-difficulty-tabs', { defaultValue: 'Difficulty' })}
        />
      </div>

      <div className="flex items-center gap-2">
        <label
          htmlFor="slice-nesting-mode"
          className="flex items-center gap-1.5 text-xs opacity-70"
        >
          {nestingMode === 'off' ? (
            <Link2Off className="h-4 w-4" aria-hidden />
          ) : (
            <Link2 className="h-4 w-4" aria-hidden />
          )}
          {t('editor-nesting-label', { defaultValue: 'Nesting' })}
        </label>
        <Select
          id="slice-nesting-mode"
          controlSize="sm"
          value={nestingMode}
          onChange={(event) => setNestingMode(event.target.value as NestingMode)}
        >
          <option value="cascade">
            {t('editor-nesting-cascade', { defaultValue: 'Cascade' })}
          </option>
          <option value="warn">{t('editor-nesting-warn', { defaultValue: 'Warn' })}</option>
          <option value="off">{t('editor-nesting-off', { defaultValue: 'Off' })}</option>
        </Select>
      </div>

      {violations.length > 0 && (
        <div className="flex items-center gap-2 text-xs">
          <AlertTriangle className="h-4 w-4 text-site-warning" aria-hidden />
          <span>
            {t('editor-nesting-violations', {
              defaultValue: '{{count}} notes break Easy ⊆ Normal ⊆ Hard ⊆ Expert',
              count: violations.length,
            })}
          </span>
          <Button
            size="xs"
            variant="outline"
            onClick={() => apply(repairNesting(charts))}
            className="neumorphic-sm border-0"
          >
            {t('editor-nesting-repair', { defaultValue: 'Repair' })}
          </Button>
        </div>
      )}
    </div>
  );
}
