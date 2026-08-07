'use client';

/**
 * Properties of the current selection.
 *
 * Design doc: `docs/slice-it-chart-editor.md` §12.4 (the right rail).
 *
 * It is also where §14's "colour is never the only channel" is paid off: the
 * quantisation the canvas encodes as a colour is printed here as a fraction.
 */

import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { SLICE_TYPES } from '@/lib/slice-it/constants';
import { retypeNotes, setDuration } from '@/lib/slice-it/editor/commands';
import { nestedDelete } from '@/lib/slice-it/editor/nesting';
import { barBeatAt, quantizationOf } from '@/lib/slice-it/editor/snap';
import { selectedNotes, useEditorStore } from '@/lib/slice-it/editor/store';
import type { SliceType } from '@/lib/slice-it/editor/types';
import { QUANT_LABELS } from './theme';

export function NoteInspector() {
  const { t } = useTranslation('r-slice-it');
  const charts = useEditorStore((s) => s.charts);
  const active = useEditorStore((s) => s.active);
  const timingPoints = useEditorStore((s) => s.timingPoints);
  const nestingMode = useEditorStore((s) => s.nestingMode);
  const apply = useEditorStore((s) => s.apply);

  const selection = selectedNotes({ charts, active });
  const first = selection[0];

  return (
    <section className="neumorphic p-4" aria-labelledby="slice-inspector-title">
      <h2 id="slice-inspector-title" className="mb-3 text-sm font-semibold">
        {t('editor-inspector-title', { defaultValue: 'Note' })}
      </h2>

      {!first ? (
        <p className="text-xs opacity-70">
          {t('editor-inspector-empty', {
            defaultValue: 'Select a note on the timeline to edit it.',
          })}
        </p>
      ) : (
        <div className="flex flex-col gap-3 text-sm">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <dt className="opacity-70">
              {t('editor-inspector-count', { defaultValue: 'Selected' })}
            </dt>
            <dd className="tabular-nums">{selection.length}</dd>
            <dt className="opacity-70">{t('editor-inspector-time', { defaultValue: 'Time' })}</dt>
            <dd className="tabular-nums">{first.time.toFixed(3)}s</dd>
            <dt className="opacity-70">
              {t('editor-inspector-bar', { defaultValue: 'Bar/beat' })}
            </dt>
            <dd className="tabular-nums">
              {(() => {
                const at = barBeatAt(first.time, timingPoints);
                return `${at.bar}.${at.beat}`;
              })()}
            </dd>
            <dt className="opacity-70">{t('editor-inspector-lane', { defaultValue: 'Lane' })}</dt>
            <dd className="tabular-nums">{first.lane + 1}</dd>
            <dt className="opacity-70">
              {t('editor-inspector-quant', { defaultValue: 'Quantise' })}
            </dt>
            <dd>{QUANT_LABELS[quantizationOf(first.time, timingPoints)]}</dd>
            <dt className="opacity-70">
              {t('editor-inspector-origin', { defaultValue: 'Origin' })}
            </dt>
            <dd>
              {first.auto
                ? t('editor-inspector-auto', { defaultValue: 'Generated' })
                : t('editor-inspector-yours', { defaultValue: 'Yours' })}
            </dd>
          </dl>

          <div>
            <label htmlFor="slice-note-type" className="mb-1 block text-xs opacity-70">
              {t('editor-inspector-type', { defaultValue: 'Type' })}
            </label>
            <Select
              id="slice-note-type"
              controlSize="sm"
              value={first.type}
              onChange={(event) =>
                apply(retypeNotes(active, selection, event.target.value as SliceType))
              }
            >
              {SLICE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </Select>
          </div>

          {first.type === 'LONG' && (
            <div>
              <label htmlFor="slice-note-duration" className="mb-1 block text-xs opacity-70">
                {t('editor-inspector-duration', { defaultValue: 'Hold length (seconds)' })}
              </label>
              <Input
                id="slice-note-duration"
                type="number"
                min={0}
                max={60}
                step={0.05}
                value={first.duration ?? 0}
                onChange={(event) =>
                  apply(setDuration(active, selection, Number(event.target.value)))
                }
              />
            </div>
          )}

          <Button
            variant="destructive"
            size="sm"
            onClick={() => apply(nestedDelete(nestingMode, charts, active, selection))}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            {t('editor-inspector-delete', { defaultValue: 'Delete selection' })}
          </Button>
        </div>
      )}

      {/*
        TODO(phase 7 — §9): the lint panel lists this note's issues here and
        clicking one seeks the playhead to it.
        TODO(phase 8 — §4.4b): the note's aggregate miss rate, once O1 exists.
      */}
    </section>
  );
}
