import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { Mic, Square, Trash2, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PRONUNCIATION_MAX_MS } from '@/lib/profile/plus';
import type { RecordedClip, VoiceRecorder } from '@/lib/voice/recorder';

import { api } from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import {
  removePronunciationApi,
  uploadPronunciationApi,
} from '@/lib/profile/pronunciation.contract';
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
  // True from the tap until the microphone answers: the button is disabled so
  // a second tap cannot open a second recorder (and leak the first one's mic).
  const [starting, setStarting] = useState(false);
  const startingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      recorderRef.current?.cancel();
      recorderRef.current = null;
      audioRef.current?.pause();
    };
  }, []);

  async function upload(clip: RecordedClip) {
    setBusy(true);
    try {
      const form = new FormData();
      form.append('audio', clip.blob, 'pronunciation');
      form.append('durationMs', String(Math.round(clip.durationMs)));
      const json = await api(uploadPronunciationApi, { body: form }).catch((e: unknown) => {
        toast.error(
          serverError(e) ?? t('pron-failed', { defaultValue: "Couldn't save that recording" }),
        );
        return null;
      });
      if (!json) return;
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
    if (startingRef.current || recorderRef.current) return;
    startingRef.current = true;
    setStarting(true);
    try {
      await startRecorder();
    } finally {
      startingRef.current = false;
      if (mountedRef.current) setStarting(false);
    }
  }

  async function startRecorder() {
    const { VoiceRecorder, VoiceRecorderError } = await import('@/lib/voice/recorder');
    if (!mountedRef.current) return;
    const recorder = new VoiceRecorder('free', {
      onTick: (_level, ms) => {
        setElapsed(ms);
        if (ms >= PRONUNCIATION_MAX_MS) void finish();
      },
      onError: () => {
        // The wrapper cancels itself; drop our handle so a later Stop or
        // unmount doesn't act on a dead recorder.
        if (recorderRef.current === recorder) recorderRef.current = null;
        recorder.cancel();
        setRecording(false);
        toast.error(t('pron-error', { defaultValue: 'Recording failed. Try again.' }));
      },
    });
    try {
      await recorder.start();
    } catch (err) {
      if (!mountedRef.current) return;
      const denied = err instanceof VoiceRecorderError && err.reason === 'denied';
      toast.error(
        denied
          ? t('pron-denied', { defaultValue: 'Allow microphone access to record.' })
          : t('pron-unsupported', { defaultValue: "This browser can't record audio." }),
      );
      return;
    }
    if (!mountedRef.current) {
      // Unmounted while the permission prompt was open: release the mic.
      recorder.cancel();
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
      await api(removePronunciationApi);
      onChange(null);
      toast.success(t('pron-removed', { defaultValue: 'Pronunciation removed' }));
    } catch {
      // Not removed: the clip stays and the button is usable again.
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {recording ? (
        <Button variant="danger" size="sm" onClick={() => void finish()}>
          <Square aria-hidden />
          {t('pron-stop', {
            seconds: (elapsed / 1000).toFixed(1),
            max: PRONUNCIATION_MAX_MS / 1000,
            defaultValue: 'Stop ({{seconds}} / {{max}} s)',
          })}
        </Button>
      ) : (
        <Button
          variant="default"
          size="sm"
          loading={busy}
          disabled={starting}
          onClick={() => void start()}
        >
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
