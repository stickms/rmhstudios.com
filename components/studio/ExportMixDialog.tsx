/**
 * Export mix… — renders the project to a WAV in this browser and downloads it. Nothing is uploaded. Painted with
 * `--app-*` tokens like every Studio overlay (L8).
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { DialogOverlay } from '@/components/ui/dialog';
import { Tabs } from '@/components/ui/tabs';
import { appRoot } from '@/components/studio/app-root';
import { useMixRender } from '@/components/studio/useMixRender';
import { StudioEngine } from '@/lib/studio/engine/StudioEngine';
import { downloadBlob, formatClock, safeFileName } from '@/lib/studio/export/download';
import { exportRange, MAX_EXPORT_SECONDS, wavBytes, type BitDepth, type ExportMode } from '@/lib/studio/export/range';
import { useExportUi } from '@/lib/studio/export/ui-store';
import { useStudioStore } from '@/lib/studio/store';

const FIELD =
  'min-h-9 w-full rounded-app-sm border border-app-border bg-app-bg px-2 text-sm text-app-text pointer-coarse:min-h-11';
const BUTTON =
  'min-h-9 rounded-app-sm border border-app-border px-3 text-sm hover:bg-app-surface-hover disabled:opacity-50 pointer-coarse:min-h-11';

export function ExportMixDialog() {
  const { t, i18n } = useTranslation('studio-export');
  const close = useExportUi((s) => s.closeExport);
  const projectName = useStudioStore((s) => s.projectName);
  const { state, render, cancel, reset } = useMixRender();
  const [mode, setMode] = useState<ExportMode>('song');
  const [bitDepth, setBitDepth] = useState<BitDepth>(16);
  const [fileName, setFileName] = useState(() => safeFileName(projectName));
  const [rate, setRate] = useState<number | null>(null);
  const [message, setMessage] = useState('');

  // The context rate is the project's rate; the engine starts here, on the member's click or key press.
  useEffect(() => {
    let live = true;
    const engine = StudioEngine.getInstance();
    void engine
      .initialize()
      .then(() => {
        if (live) setRate(engine.getTone().getContext().sampleRate);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const bpm = useStudioStore((s) => s.bpm);
  const tracks = useStudioStore((s) => s.tracks);
  const clips = useStudioStore((s) => s.clips);
  const loopStart = useStudioStore((s) => s.loopStart);
  const loopEnd = useStudioStore((s) => s.loopEnd);
  const range = useMemo(
    () =>
      exportRange({
        mode,
        bpm,
        tracks,
        clips,
        loopStart,
        loopEnd,
      }),
    [mode, bpm, tracks, clips, loopStart, loopEnd],
  );

  const number = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        maximumFractionDigits: 1,
      }),
    [i18n.language],
  );
  const rendering = state.kind === 'rendering';

  const refusal = !range.ok
    ? range.reason === 'empty'
      ? t('refuse-empty', {
          defaultValue: 'There is nothing to export: no clips on tracks that are playing.',
        })
      : range.reason === 'no-loop'
        ? t('refuse-no-loop', {
            defaultValue: 'Set a loop region first, or export the whole song.',
          })
        : t('refuse-too-long', {
            count: Number(MAX_EXPORT_SECONDS / 60),
            defaultValue_one: 'This is {{length}} long. An export can be at most {{max}} minute; shorten the range.',
            defaultValue: 'This is {{length}} long. An export can be at most {{max}} minutes; shorten the range.',
            length: formatClock(range.durationSeconds),
            max: MAX_EXPORT_SECONDS / 60,
          })
    : null;
  const sizeMb = range.ok && rate ? wavBytes(range.durationSeconds, rate, bitDepth) / (1024 * 1024) : null;

  const start = async () => {
    setMessage('');
    const blob = await render({
      mode,
      bitDepth,
    });
    if (!blob) return;
    const name = `${safeFileName(fileName, safeFileName(projectName))}.wav`;
    downloadBlob(blob, name);
    setMessage(
      t('done-message', {
        name,
        defaultValue: 'Exported {{name}}.',
      }),
    );
  };

  const failure =
    state.kind === 'error' && state.reason === 'failed'
      ? t('error-failed', {
          defaultValue: 'The export did not finish. Try again, or export a shorter range.',
        })
      : state.kind === 'cancelled'
        ? t('cancelled', {
            defaultValue: 'Export cancelled.',
          })
        : '';
  const percent = rendering ? Math.round(state.fraction * 100) : 0;

  return (
    <DialogPrimitive.Root open onOpenChange={(next) => !next && !rendering && close()}>
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
              {t('export-title', {
                defaultValue: 'Export mix',
              })}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label={t('close', {
                defaultValue: 'Close',
              })}
              disabled={rendering}
              className="flex size-9 items-center justify-center rounded-app-sm text-app-text-muted hover:bg-app-surface-hover hover:text-app-text disabled:opacity-50 pointer-coarse:size-11"
            >
              <X className="size-4" aria-hidden />
            </DialogPrimitive.Close>
          </div>

          <div className="space-y-4 px-4 pb-4 pt-3">
            <div className="space-y-1">
              <p className="text-xs text-app-text-muted">
                {t('range-label', {
                  defaultValue: 'Range',
                })}
              </p>
              <Tabs
                size="sm"
                aria-label={t('range-label', {
                  defaultValue: 'Range',
                })}
                value={mode}
                onChange={(id) => !rendering && setMode(id as ExportMode)}
                tabs={[
                  {
                    id: 'song',
                    label: t('range-song', {
                      defaultValue: 'Whole song',
                    }),
                  },
                  {
                    id: 'loop',
                    label: t('range-loop', {
                      defaultValue: 'Loop region',
                    }),
                  },
                ]}
              />
            </div>

            <div className="space-y-1">
              <p className="text-xs text-app-text-muted">
                {t('depth-label', {
                  defaultValue: 'Bit depth',
                })}
              </p>
              <Tabs
                size="sm"
                aria-label={t('depth-label', {
                  defaultValue: 'Bit depth',
                })}
                value={String(bitDepth)}
                onChange={(id) => !rendering && setBitDepth(id === '24' ? 24 : 16)}
                tabs={[
                  {
                    id: '16',
                    label: t('depth-16', {
                      defaultValue: '16-bit',
                    }),
                  },
                  {
                    id: '24',
                    label: t('depth-24', {
                      defaultValue: '24-bit',
                    }),
                  },
                ]}
              />
            </div>

            <p className="text-sm">
              <span className="text-app-text-muted">
                {t('rate-label', {
                  defaultValue: 'Sample rate',
                })}
              </span>{' '}
              {rate
                ? t('rate-value', {
                    rate: number.format(rate / 1000),
                    defaultValue: '{{rate}} kHz',
                  })
                : t('rate-pending', {
                    defaultValue: 'Starting the audio engine…',
                  })}
            </p>

            <label className="block space-y-1">
              <span className="text-xs text-app-text-muted">
                {t('name-label', {
                  defaultValue: 'File name',
                })}
              </span>
              {/* A file name reads left to right in every locale, so ".wav" stays after it in RTL too. */}
              <span dir="ltr" className="flex items-center gap-2">
                <input
                  className={FIELD}
                  value={fileName}
                  maxLength={80}
                  disabled={rendering}
                  onChange={(e) => setFileName(e.target.value)}
                />
                <span className="text-sm text-app-text-muted">.wav</span>
              </span>
            </label>

            <p className="border-t border-app-border pt-3 text-sm text-app-text-muted">
              {refusal ??
                (range.ok && sizeMb !== null
                  ? t('summary', {
                      length: formatClock(range.durationSeconds),
                      size: number.format(sizeMb),
                      defaultValue: 'Length {{length}}, about {{size}} MB.',
                    })
                  : range.ok
                    ? t('summary-length', {
                        length: formatClock(range.durationSeconds),
                        defaultValue: 'Length {{length}}.',
                      })
                    : '')}
            </p>

            {rendering ? (
              <div className="space-y-1">
                <div
                  role="progressbar"
                  aria-label={t('progress-label', {
                    defaultValue: 'Rendering',
                  })}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={percent}
                  className="h-2 w-full overflow-hidden rounded-app-sm border border-app-border bg-app-bg"
                >
                  <div
                    className="h-full bg-app-accent"
                    style={{
                      width: `${percent}%`,
                    }}
                  />
                </div>
                <p className="text-xs text-app-text-muted">
                  {t('progress-times', {
                    elapsed: formatClock(state.elapsedMs / 1000),
                    estimate: formatClock(state.totalMs / 1000),
                    defaultValue: '{{elapsed}} elapsed, about {{estimate}} in all',
                  })}
                </p>
              </div>
            ) : null}

            <p
              role="status"
              aria-live="polite"
              className={`min-h-5 text-sm ${failure && state.kind === 'error' ? 'text-app-danger' : 'text-app-text-muted'}`}
            >
              {failure || message}
            </p>

            <div className="flex justify-end gap-2">
              {rendering ? (
                <button type="button" className={BUTTON} onClick={cancel}>
                  {t('cancel', {
                    defaultValue: 'Cancel',
                  })}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className={BUTTON}
                    onClick={() => {
                      reset();
                      close();
                    }}
                  >
                    {t('close', {
                      defaultValue: 'Close',
                    })}
                  </button>
                  <button
                    type="button"
                    disabled={!range.ok}
                    onClick={() => void start()}
                    className="min-h-9 rounded-app-sm bg-app-accent px-3 text-sm font-medium text-app-accent-fg hover:bg-app-accent-hover disabled:opacity-50 pointer-coarse:min-h-11"
                  >
                    {t('render', {
                      defaultValue: 'Render',
                    })}
                  </button>
                </>
              )}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
