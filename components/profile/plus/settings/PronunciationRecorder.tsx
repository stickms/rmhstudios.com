'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Mic, Square, Trash2, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PRONUNCIATION_MAX_MS } from '@/lib/profile/plus';
import type { RecordedClip, VoiceRecorder } from '@/lib/voice/recorder';

/**
 * P3 — record the 5-second "this is how you say my name" clip. Uses the same
 * `MediaRecorder` wrapper as DM voice notes (it releases the microphone on every
 * exit path); the 5 s cap is enforced here by stopping the recorder, and again on
 * the server, which sniffs the container and refuses anything longer.
 */
export function PronunciationRecorder({
  url,
  onChange,
}: {
  url: string | null;
  onChange: (url: string | null) => void;
}) {
  const { t } = useTranslation('f-profile-plus');
  const recorderRef = useRef<VoiceRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(
    () => () => {
      recorderRef.current?.cancel();
      audioRef.current?.pause();
    },
    [],
  );

  async function upload(clip: RecordedClip) {
    setBusy(true);
    try {
      const form = new FormData();
      form.append('audio', clip.blob, 'pronunciation');
      form.append('durationMs', String(Math.round(clip.durationMs)));
      const res = await fetch('/api/profile/pronunciation', { method: 'POST', body: form });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        pronunciationUrl?: string | null;
      };
      if (!res.ok) {
        toast.error(
          json.error ?? t('pron-failed', { defaultValue: "Couldn't save that recording" }),
        );
        return;
      }
      onChange(json.pronunciationUrl ?? null);
      toast.success(t('pron-saved', { defaultValue: 'Pronunciation saved' }));
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    setRecording(false);
    const clip = await recorder?.stop();
    if (clip) await upload(clip);
  }

  async function start() {
    const { VoiceRecorder, VoiceRecorderError } = await import('@/lib/voice/recorder');
    const recorder = new VoiceRecorder('free', {
      onTick: (_level, ms) => {
        setElapsed(ms);
        if (ms >= PRONUNCIATION_MAX_MS) void finish();
      },
      onError: () => {
        setRecording(false);
        toast.error(t('pron-error', { defaultValue: 'Recording failed. Try again.' }));
      },
    });
    try {
      await recorder.start();
    } catch (err) {
      const denied = err instanceof VoiceRecorderError && err.reason === 'denied';
      toast.error(
        denied
          ? t('pron-denied', { defaultValue: 'Allow microphone access to record.' })
          : t('pron-unsupported', { defaultValue: "This browser can't record audio." }),
      );
      return;
    }
    recorderRef.current = recorder;
    setElapsed(0);
    setRecording(true);
  }

  function play() {
    if (!url) return;
    audioRef.current?.pause();
    audioRef.current = new Audio(url);
    void audioRef.current.play().catch(() => {});
  }

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch('/api/profile/pronunciation', { method: 'DELETE' });
      if (res.ok) {
        onChange(null);
        toast.success(t('pron-removed', { defaultValue: 'Pronunciation removed' }));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {recording ? (
        <Button variant="destructive" size="sm" onClick={() => void finish()}>
          <Square aria-hidden />
          {t('pron-stop', {
            seconds: (elapsed / 1000).toFixed(1),
            max: PRONUNCIATION_MAX_MS / 1000,
            defaultValue: 'Stop ({{seconds}} / {{max}} s)',
          })}
        </Button>
      ) : (
        <Button variant="outline" size="sm" loading={busy} onClick={() => void start()}>
          <Mic aria-hidden />
          {url
            ? t('pron-rerecord', { defaultValue: 'Record again' })
            : t('pron-record', { defaultValue: 'Record (5 s)' })}
        </Button>
      )}
      {url && !recording ? (
        <>
          <Button variant="ghost" size="sm" onClick={play}>
            <Volume2 aria-hidden />
            {t('pron-play', { defaultValue: 'Play' })}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void remove()} disabled={busy}>
            <Trash2 aria-hidden />
            {t('pron-remove', { defaultValue: 'Remove' })}
          </Button>
        </>
      ) : null}
    </div>
  );
}
