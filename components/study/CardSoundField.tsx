import { useRefusalText } from '@/components/errors/useRefusalText';
import { useId, useRef, useState } from 'react';
import { Mic, Square, Trash2, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CardSound } from '@/components/study/CardSound';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/contract/client';
import { toast } from '@/lib/toast';
import {
  CARD_SOUND_MAX_BYTES,
  CARD_SOUND_MAX_MS,
  CARD_SOUND_TEXT_MAX,
  formatSoundLength,
  type CardSound as CardSoundValue,
} from '@/lib/study/card-sound';
import { uploadCardSoundApi } from '@/lib/study/card-sound.contract';
import { useCanRecordSound, useCardSoundRecorder } from '@/components/study/useCardSoundRecorder';

type Phase = 'idle' | 'uploading';

/**
 * One side's sound in the card form (s10-02): record (with an elapsed counter that runs only while recording) or
 * upload a short file, play it, remove it, and write the transcript. A sound cannot be saved without its
 * transcript, so the field is required and says why; the form holds the save back until it is filled in
 * (`showMissing` marks it) and the server refuses it too. State changes are announced in a polite live region.
 *
 * The audio goes to `POST /api/study/card-sound` from an event handler; nothing here fetches on its own.
 */
export function CardSoundField({
  side,
  value,
  onChange,
  showMissing,
}: {
  side: 'front' | 'back';
  value: CardSoundValue | null;
  onChange: (next: CardSoundValue | null) => void;
  /** The form was submitted: mark an empty transcript as the problem. */
  showMissing: boolean;
}) {
  const { t } = useTranslation('card-sound');
  const refusalText = useRefusalText();
  const uid = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const canRecord = useCanRecordSound();
  const [phase, setPhase] = useState<Phase>('idle');
  const [status, setStatus] = useState('');
  const recorder = useCardSoundRecorder({
    onRecorded: (blob, durationMs) => void store(blob, durationMs),
    onDenied: () => {
      setStatus('');
      toast.error(t('mic-denied', { defaultValue: 'The microphone could not be used.' }));
    },
  });
  const textId = `${uid}-text`;
  const hintId = `${uid}-hint`;
  const missing = showMissing && value !== null && value.transcript.trim() === '';

  async function store(blob: Blob, durationMs: number) {
    if (blob.size === 0) {
      setPhase('idle');
      return;
    }
    if (blob.size > CARD_SOUND_MAX_BYTES) {
      setPhase('idle');
      toast.error(t('too-large', { defaultValue: 'That sound is too large. Keep it under 512 KB.' }));
      return;
    }
    setPhase('uploading');
    setStatus(t('status-uploading', { defaultValue: 'Uploading the sound' }));
    const body = new FormData();
    body.append('audio', blob, 'sound');
    body.append('durationMs', String(Math.max(1, Math.min(Math.round(durationMs), CARD_SOUND_MAX_MS))));
    try {
      const stored = await api(uploadCardSoundApi, { body });
      // Replacing keeps the transcript the member already wrote.
      onChange({ url: stored.url, durationMs: stored.durationMs, transcript: value?.transcript ?? '' });
      setStatus(t('status-added', { defaultValue: 'Sound added. Write what it says.' }));
    } catch (err) {
      setStatus('');
      toast.error(refusalText.maybe(err) ?? t('upload-failed', { defaultValue: 'The sound could not be uploaded.' }));
    } finally {
      setPhase('idle');
    }
  }

  async function startRecording() {
    setStatus(t('status-recording', { defaultValue: 'Recording' }));
    await recorder.start();
  }

  function stopRecording() {
    setStatus(t('status-stopped', { defaultValue: 'Recording stopped' }));
    recorder.stop();
  }

  /** An uploaded file: its length is read from the file itself, in the browser, and the server checks the bytes. */
  async function pickFile(file: File | undefined) {
    if (!file) return;
    const durationMs = await measure(file);
    if (durationMs === null) {
      toast.error(t('unreadable', { defaultValue: 'That file could not be read as a sound.' }));
      return;
    }
    if (durationMs > CARD_SOUND_MAX_MS) {
      toast.error(t('too-long', { defaultValue: 'Keep the sound to 15 seconds or less.' }));
      return;
    }
    await store(file, durationMs);
  }

  const recording = recorder.recording;
  const busy = phase !== 'idle' || recording;
  const recordLabel =
    side === 'front'
      ? t('record-front', { defaultValue: 'Record a sound for the front' })
      : t('record-back', { defaultValue: 'Record a sound for the back' });
  const uploadLabel =
    side === 'front'
      ? t('upload-front', { defaultValue: 'Upload a sound for the front' })
      : t('upload-back', { defaultValue: 'Upload a sound for the back' });
  const removeLabel =
    side === 'front'
      ? t('remove-front', { defaultValue: 'Remove the front sound' })
      : t('remove-back', { defaultValue: 'Remove the back sound' });
  const fileLabel =
    side === 'front'
      ? t('front-sound-file', { defaultValue: 'Front sound file' })
      : t('back-sound-file', { defaultValue: 'Back sound file' });

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={fileRef}
        type="file"
        accept="audio/webm,audio/ogg,audio/mp4,audio/x-m4a,audio/aac,.webm,.ogg,.m4a,.mp4,.aac"
        className="sr-only"
        tabIndex={-1}
        aria-label={fileLabel}
        onChange={(e) => {
          void pickFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {value && <CardSound sound={value} side={side} showTranscript={false} className="items-start" />}
      <div className="flex flex-wrap items-center gap-2">
        {recording ? (
          <Button type="button" onClick={stopRecording}>
            <Square aria-hidden />
            {t('stop-recording', { defaultValue: 'Stop recording' })}
          </Button>
        ) : (
          canRecord && (
            <Button type="button" disabled={busy} onClick={() => void startRecording()}>
              <Mic aria-hidden />
              {value ? t('record-again', { defaultValue: 'Record again' }) : recordLabel}
            </Button>
          )
        )}
        <Button
          type="button"
          loading={phase === 'uploading'}
          disabled={recording}
          onClick={() => fileRef.current?.click()}
        >
          <Upload aria-hidden />
          {value ? t('replace-file', { defaultValue: 'Upload another file' }) : uploadLabel}
        </Button>
        {value && (
          <Button type="button" variant="ghost" disabled={busy} onClick={() => onChange(null)}>
            <Trash2 aria-hidden />
            {removeLabel}
          </Button>
        )}
        {recording && (
          <span className="t-meta" dir="ltr">
            {formatSoundLength(recorder.elapsed)} / {formatSoundLength(CARD_SOUND_MAX_MS)}
          </span>
        )}
        {!value && !busy && (
          <span className="t-meta">
            {t('upload-limit', { defaultValue: 'WebM, Ogg, M4A or AAC, up to 15 seconds and 512 KB.' })}
          </span>
        )}
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>
      {value && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={textId}>{t('transcript', { defaultValue: 'Transcript' })}</Label>
          <Input
            id={textId}
            dir="auto"
            value={value.transcript}
            maxLength={CARD_SOUND_TEXT_MAX}
            required
            aria-invalid={missing || undefined}
            aria-describedby={missing ? `${hintId} ${uid}-missing` : hintId}
            onChange={(e) => onChange({ ...value, transcript: e.target.value })}
          />
          <p id={hintId} className="t-meta">
            {t('transcript-hint', {
              defaultValue: 'Required. What is said, or what the sound is. A screen reader reads it with the sound.',
            })}
          </p>
          {missing && (
            <p id={`${uid}-missing`} role="alert" className="t-meta text-site-danger">
              {t('transcript-required', { defaultValue: 'Write the transcript before you save the card' })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** The length of an audio file in milliseconds, read by the browser; null when it cannot decode it. */
function measure(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    if (typeof Audio === 'undefined') {
      resolve(null);
      return;
    }
    const url = URL.createObjectURL(file);
    const el = new Audio();
    const done = (ms: number | null) => {
      URL.revokeObjectURL(url);
      resolve(ms);
    };
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      // A recording without a length header reports Infinity: count it as the longest allowed, the byte cap bounds it.
      done(Number.isFinite(el.duration) ? Math.max(1, Math.round(el.duration * 1000)) : CARD_SOUND_MAX_MS);
    };
    el.onerror = () => done(null);
    el.src = url;
  });
}
