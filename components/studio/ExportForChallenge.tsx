/**
 * "Export for this challenge" — renders a 16-bit 44.1 kHz WAV and hands it to the entry form's own file input. The
 * form's upload (its sniffing and 8 MB limit) is unchanged and still runs on submit; a mix that is too long is not
 * attached, and the member is offered the download instead.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AudioLines } from 'lucide-react';
import { useMixRender } from '@/components/studio/useMixRender';
import { CHALLENGE_AUDIO_MAX_BYTES } from '@/lib/studio/challenge/shared';
import { safeFileName } from '@/lib/studio/export/download';
import { challengeFit, exportRange } from '@/lib/studio/export/range';
import { useExportUi } from '@/lib/studio/export/ui-store';
import { useStudioStore } from '@/lib/studio/store';

const CHALLENGE_RATE = 44_100;

export function ExportForChallenge({ onFile }: { onFile: (file: File) => void }) {
  const { t, i18n } = useTranslation('studio-export');
  const { state, render, cancel } = useMixRender();
  const [message, setMessage] = useState('');
  const [tooLarge, setTooLarge] = useState(false);
  const rendering = state.kind === 'rendering';
  const number = new Intl.NumberFormat(i18n.language, {
    maximumFractionDigits: 1,
  });

  const run = async () => {
    setMessage('');
    setTooLarge(false);
    const s = useStudioStore.getState();
    const range = exportRange({
      mode: 'song',
      bpm: s.bpm,
      tracks: s.tracks,
      clips: s.clips,
      loopStart: s.loopStart,
      loopEnd: s.loopEnd,
    });
    if (range.ok) {
      const fit = challengeFit(range.durationSeconds, CHALLENGE_RATE);
      if (!fit.fits) {
        // Refuse before rendering: it would only be thrown away.
        setTooLarge(true);
        setMessage(
          t('challenge-too-large', {
            size: number.format(fit.bytes / (1024 * 1024)),
            max: CHALLENGE_AUDIO_MAX_BYTES / (1024 * 1024),
            defaultValue: 'This mix would be {{size}} MB, over the {{max}} MB limit for an entry. Download it instead.',
          }),
        );
        return;
      }
    }
    const blob = await render({
      mode: 'song',
      bitDepth: 16,
      sampleRate: CHALLENGE_RATE,
    });
    if (!blob) return;
    if (blob.size > CHALLENGE_AUDIO_MAX_BYTES) {
      setTooLarge(true);
      setMessage(
        t('challenge-too-large-after', {
          defaultValue: 'The mix is over the 8 MB limit for an entry. Download it instead.',
        }),
      );
      return;
    }
    onFile(
      new File([blob], `${safeFileName(s.projectName)}.wav`, {
        type: 'audio/wav',
      }),
    );
    setMessage(
      t('challenge-attached', {
        defaultValue: 'Mix attached to your entry.',
      }),
    );
  };

  const errorText =
    state.kind === 'error'
      ? state.reason === 'empty'
        ? t('challenge-empty', {
            defaultValue: 'There is nothing to export: no clips on tracks that are playing.',
          })
        : state.reason === 'too-long'
          ? t('challenge-long', {
              defaultValue: 'This project is longer than an export can be.',
            })
          : t('challenge-failed', {
              defaultValue: 'The export did not finish. Try again.',
            })
      : state.kind === 'cancelled'
        ? t('cancelled', {
            defaultValue: 'Export cancelled.',
          })
        : '';

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        {rendering ? (
          <button
            type="button"
            onClick={cancel}
            className="min-h-9 rounded-app-sm border border-app-border px-3 text-xs hover:bg-app-surface-hover pointer-coarse:min-h-11"
          >
            {t('cancel', {
              defaultValue: 'Cancel',
            })}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void run()}
            className="flex min-h-9 items-center gap-1.5 rounded-app-sm border border-app-border px-3 text-xs hover:bg-app-surface-hover pointer-coarse:min-h-11"
          >
            <AudioLines className="size-3.5" aria-hidden />
            {t('challenge-export', {
              defaultValue: 'Export for this challenge',
            })}
          </button>
        )}
        {tooLarge ? (
          <button
            type="button"
            onClick={() => useExportUi.getState().openExport()}
            className="min-h-9 rounded-app-sm border border-app-border px-3 text-xs hover:bg-app-surface-hover pointer-coarse:min-h-11"
          >
            {t('challenge-download', {
              defaultValue: 'Download instead',
            })}
          </button>
        ) : null}
      </div>
      {rendering ? (
        <div
          role="progressbar"
          aria-label={t('progress-label', {
            defaultValue: 'Rendering',
          })}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(state.fraction * 100)}
          className="h-1.5 w-full overflow-hidden rounded-app-sm border border-app-border bg-app-bg"
        >
          <div
            className="h-full bg-app-accent"
            style={{
              width: `${Math.round(state.fraction * 100)}%`,
            }}
          />
        </div>
      ) : null}
      <p
        role="status"
        aria-live="polite"
        className={`min-h-4 text-xs ${errorText ? 'text-app-danger' : 'text-app-text-muted'}`}
      >
        {errorText || message}
      </p>
    </div>
  );
}
