/**
 * The clipboard, mirror, quantise, scale and time operations as the UI sees them:
 * one `run(op)` the key handler and the Edit menu both call, and the sentence each
 * result is announced with.
 *
 * Engine code returns codes and counts (`engine/editor/clipboard.ts`); this is the
 * one place they become text, so every string is a literal `t()` key in the
 * `slice-it-clipboard` namespace.
 */

import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditorStore } from '@features/slice-it/engine/editor/store';
import type { ClipboardResult } from '@features/slice-it/engine/editor/clipboard';
import { formatTime } from './Timeline';

export type ClipboardOp =
  | 'copy'
  | 'cut'
  | 'paste'
  | 'paste-mirrored'
  | 'duplicate'
  | 'mirror'
  | 'quantize'
  | 'scale'
  | 'insert-time'
  | 'remove-time';

/** Operations that need notes selected first. */
const NEEDS_SELECTION: readonly ClipboardOp[] = [
  'copy',
  'cut',
  'duplicate',
  'mirror',
  'quantize',
  'scale',
];

/** Whether an operation can run now — the menu disables what cannot. */
export function canRunOp(
  op: ClipboardOp,
  state: { hasSelection: boolean; hasClipboard: boolean },
): boolean {
  if (NEEDS_SELECTION.includes(op)) return state.hasSelection;
  if (op === 'paste' || op === 'paste-mirrored') return state.hasClipboard;
  return true;
}

export function useClipboardActions(announce: (message: string) => void, openScale: () => void) {
  const { t } = useTranslation('slice-it-clipboard');

  const describe = useCallback(
    (result: ClipboardResult): string => {
      const unit = (division: number) => (division === 1 ? '1' : `1/${division}`);
      const extras = (clamped: number, skipped: number): string => {
        const parts: string[] = [];
        if (clamped > 0)
          parts.push(
            t('announce-clamped', {
              defaultValue: '{{count}} clamped to the chart’s lanes.',
              count: clamped,
            }),
          );
        if (skipped > 0)
          parts.push(
            t('announce-skipped', {
              defaultValue: '{{count}} skipped, already there.',
              count: skipped,
            }),
          );
        return parts.length > 0 ? ` ${parts.join(' ')}` : '';
      };
      switch (result.code) {
        case 'nothing-selected':
          return t('announce-select-first', { defaultValue: 'Select notes first' });
        case 'clipboard-empty':
          return t('announce-clipboard-empty', { defaultValue: 'Nothing copied yet' });
        case 'nothing-changed':
          return t('announce-nothing-changed', { defaultValue: 'Nothing to change' });
        case 'copied':
          return t('announce-copied', {
            defaultValue_one: 'Copied {{count}} note',
            defaultValue_other: 'Copied {{count}} notes',
            count: result.count,
          });
        case 'cut':
          return t('announce-cut', {
            defaultValue_one: 'Cut {{count}} note',
            defaultValue_other: 'Cut {{count}} notes',
            count: result.count,
          });
        case 'pasted':
          return (
            (result.mirrored
              ? t('announce-pasted-mirrored', {
                  defaultValue_one: 'Pasted {{count}} note, mirrored.',
                  defaultValue_other: 'Pasted {{count}} notes, mirrored.',
                  count: result.count,
                })
              : t('announce-pasted', {
                  defaultValue_one: 'Pasted {{count}} note.',
                  defaultValue_other: 'Pasted {{count}} notes.',
                  count: result.count,
                })) + extras(result.clamped, result.skipped)
          );
        case 'duplicated':
          return (
            t('announce-duplicated', {
              defaultValue_one: 'Duplicated {{count}} note one measure on.',
              defaultValue_other: 'Duplicated {{count}} notes one measure on.',
              count: result.count,
            }) + extras(result.clamped, result.skipped)
          );
        case 'mirrored':
          return (
            t('announce-mirrored', {
              defaultValue_one: 'Mirrored {{count}} note.',
              defaultValue_other: 'Mirrored {{count}} notes.',
              count: result.count,
            }) +
            (result.skipped > 0
              ? ` ${t('announce-mirror-blocked', {
                  defaultValue: '{{count}} left in place, the mirrored lane is taken.',
                  count: result.skipped,
                })}`
              : '')
          );
        case 'quantized':
          return (
            t('announce-quantized', {
              defaultValue_one: 'Quantized {{count}} note to 1/{{division}}.',
              defaultValue_other: 'Quantized {{count}} notes to 1/{{division}}.',
              count: result.count,
              division: result.division,
            }) +
            (result.merged > 0
              ? ` ${t('announce-merged', {
                  defaultValue: '{{count}} merged into an earlier note.',
                  count: result.merged,
                })}`
              : '')
          );
        case 'scaled':
          return (
            t('announce-scaled', {
              defaultValue_one: 'Scaled {{count}} note to {{percent}}%.',
              defaultValue_other: 'Scaled {{count}} notes to {{percent}}%.',
              count: result.count,
              percent: result.percent,
            }) +
            (result.merged > 0
              ? ` ${t('announce-merged', {
                  defaultValue: '{{count}} merged into an earlier note.',
                  count: result.merged,
                })}`
              : '')
          );
        case 'inserted':
          return t('announce-inserted', {
            defaultValue: 'Inserted {{unit}} beat at {{time}}; {{moved}} notes moved.',
            unit: unit(result.division),
            time: formatTime(result.at),
            moved: result.moved,
          });
        case 'removed':
          return t('announce-removed', {
            defaultValue:
              'Removed {{unit}} beat at {{time}}; {{deleted}} notes deleted, {{moved}} moved.',
            unit: unit(result.division),
            time: formatTime(result.at),
            deleted: result.deleted,
            moved: result.moved,
          });
      }
    },
    [t],
  );

  /** Run an operation and announce what happened. Scale opens its dialog instead. */
  const run = useCallback(
    (op: ClipboardOp) => {
      const store = useEditorStore.getState();
      let result: ClipboardResult;
      switch (op) {
        case 'copy':
          result = store.copy();
          break;
        case 'cut':
          result = store.cut();
          break;
        case 'paste':
          result = store.paste(false);
          break;
        case 'paste-mirrored':
          result = store.paste(true);
          break;
        case 'duplicate':
          result = store.duplicate();
          break;
        case 'mirror':
          result = store.mirror();
          break;
        case 'quantize':
          result = store.quantize();
          break;
        case 'scale': {
          const chart = store.charts[store.active];
          if (!chart.notes.some((note) => note.selected)) {
            result = { code: 'nothing-selected' };
            break;
          }
          openScale();
          return;
        }
        case 'insert-time':
          result = store.insertTime();
          break;
        case 'remove-time':
          result = store.removeTime();
          break;
      }
      announce(describe(result));
    },
    [announce, describe, openScale],
  );

  return { run, describe };
}
