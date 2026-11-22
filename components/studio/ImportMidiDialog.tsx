/**
 * Import MIDI… — pick a .mid file, see what is in it, and add its tracks as one undo step. The file never leaves
 * the device; a file that cannot be read changes nothing.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { DialogOverlay } from '@/components/ui/dialog';
import { appRoot } from '@/components/studio/app-root';
import { DEFAULT_TRACK_HEIGHT, MAX_BPM, MIN_BPM, TRACK_COLORS } from '@/lib/studio/constants';
import { useExportUi } from '@/lib/studio/export/ui-store';
import { importToStudio, smfToImport, type SmfImport } from '@/lib/studio/midi/convert';
import { readSmf } from '@/lib/studio/midi/smf-read';
import { SMF_MAX_BYTES, type SmfError } from '@/lib/studio/midi/smf-types';
import { useStudioStore } from '@/lib/studio/store';

const BUTTON =
  'min-h-9 rounded-app-sm border border-app-border px-3 text-sm hover:bg-app-surface-hover disabled:opacity-50 pointer-coarse:min-h-11';

export function ImportMidiDialog() {
  const { t, i18n } = useTranslation('studio-export');
  const close = useExportUi((s) => s.closeImport);
  const [summary, setSummary] = useState<SmfImport | null>(null);
  const [error, setError] = useState<SmfError | 'empty' | null>(null);
  const [useTempo, setUseTempo] = useState(false);
  const [fileLabel, setFileLabel] = useState('');
  const number = new Intl.NumberFormat(i18n.language, {
    maximumFractionDigits: 2,
  });

  const choose = async (file: File | null) => {
    setSummary(null);
    setError(null);
    if (!file) return;
    setFileLabel(file.name);
    if (file.size > SMF_MAX_BYTES) {
      setError('too-large');
      return;
    }
    const parsed = readSmf(await file.arrayBuffer().catch(() => new ArrayBuffer(0)));
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    const found = smfToImport(parsed.file);
    if (found.noteCount === 0) {
      setError('empty');
      return;
    }
    setSummary(found);
    setUseTempo(false);
  };

  const add = () => {
    if (!summary) return;
    const s = useStudioStore.getState();
    const beatsPerBar = s.timeSignature[0] * (4 / s.timeSignature[1]);
    const built = importToStudio(summary.tracks, {
      makeId: () => crypto.randomUUID(),
      firstTrackNumber: s.tracks.length + 1,
      colors: TRACK_COLORS,
      trackHeight: DEFAULT_TRACK_HEIGHT,
      barBeats: beatsPerBar > 0 ? beatsPerBar : 4,
    });
    // One undo step: the tracks, their clips and, if asked, the tempo.
    s.runStep('import-midi', () => {
      if (useTempo && summary.bpm !== null) s.setBpm(Math.min(MAX_BPM, Math.max(MIN_BPM, summary.bpm)));
      for (const track of built.tracks) s.addTrack(track);
      for (const clip of built.clips) s.addClip(clip);
    });
    close();
  };

  const errorText =
    error === null
      ? ''
      : error === 'too-large'
        ? t('import-too-large', {
            defaultValue: 'This file is over 1 MB, which is more than the Studio will read.',
          })
        : error === 'empty'
          ? t('import-empty', {
              defaultValue: 'This file has no notes to import.',
            })
          : error === 'unsupported-format' || error === 'unsupported-timing'
            ? t('import-unsupported', {
                defaultValue: 'The Studio reads type 0 and type 1 MIDI files with tempo-based timing only.',
              })
            : t('import-bad', {
                defaultValue: 'This is not a MIDI file the Studio can read. Nothing was changed.',
              });

  return (
    <DialogPrimitive.Root open onOpenChange={(next) => !next && close()}>
      <DialogPrimitive.Portal container={appRoot()}>
        <DialogOverlay
          className="app-overlay"
          style={{
            background: 'var(--app-scrim)',
          }}
        />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="app-modal border border-app-border bg-app-surface text-app-text fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-1.5rem)] w-[calc(100dvw-1.5rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto outline-none"
          style={{
            borderRadius: 'var(--app-radius-lg)',
          }}
        >
          <div className="flex items-center justify-between gap-2 px-4 pt-4">
            <DialogPrimitive.Title className="text-base font-semibold">
              {t('import-title', {
                defaultValue: 'Import MIDI',
              })}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label={t('close', {
                defaultValue: 'Close',
              })}
              className="flex size-9 items-center justify-center rounded-app-sm text-app-text-muted hover:bg-app-surface-hover hover:text-app-text pointer-coarse:size-11"
            >
              <X className="size-4" aria-hidden />
            </DialogPrimitive.Close>
          </div>

          <div className="space-y-4 px-4 pb-4 pt-3">
            <label className="block space-y-1">
              <span className="text-xs text-app-text-muted">
                {t('import-file', {
                  defaultValue: 'MIDI file',
                })}
              </span>
              <input
                type="file"
                accept=".mid,.midi,audio/midi"
                className="block w-full text-sm"
                onChange={(e) => void choose(e.target.files?.[0] ?? null)}
              />
            </label>

            <p
              role="status"
              aria-live="polite"
              className={`min-h-5 text-sm ${error ? 'text-app-danger' : 'text-app-text-muted'}`}
            >
              {errorText}
            </p>

            {summary ? (
              <div className="space-y-3 border-t border-app-border pt-3 text-sm">
                <p>
                  {t('import-summary', {
                    file: fileLabel,
                    tracks: summary.tracks.length,
                    notes: summary.noteCount,
                    defaultValue: '{{file}}: {{tracks}} tracks, {{notes}} notes.',
                  })}
                </p>
                {summary.bpm !== null ? (
                  <label className="flex min-h-9 items-center gap-2 pointer-coarse:min-h-11">
                    <input type="checkbox" checked={useTempo} onChange={(e) => setUseTempo(e.target.checked)} />
                    <span>
                      {t('import-tempo', {
                        bpm: number.format(summary.bpm),
                        defaultValue: 'Set the project tempo to {{bpm}} BPM',
                      })}
                    </span>
                  </label>
                ) : (
                  <p className="text-app-text-muted">
                    {t('import-no-tempo', {
                      defaultValue: 'The file has no tempo; the project tempo stays as it is.',
                    })}
                  </p>
                )}
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              <button type="button" className={BUTTON} onClick={close}>
                {t('cancel', {
                  defaultValue: 'Cancel',
                })}
              </button>
              <button
                type="button"
                disabled={!summary}
                onClick={add}
                className="min-h-9 rounded-app-sm bg-app-accent px-3 text-sm font-medium text-app-accent-fg hover:bg-app-accent-hover disabled:opacity-50 pointer-coarse:min-h-11"
              >
                {t('import-add', {
                  count: summary?.tracks.length ?? 0,
                  defaultValue_one: 'Add {{count}} track',
                  defaultValue_other: 'Add {{count}} tracks',
                  defaultValue: 'Add {{count}} tracks',
                })}
              </button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
