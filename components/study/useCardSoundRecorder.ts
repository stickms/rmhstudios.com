import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { CARD_SOUND_MAX_MS } from '@/lib/study/card-sound';
import { stopCardSound } from '@/lib/study/card-sound-player';

/** Whether this browser can record at all (the Record button is left out when it cannot; Upload always works). */
export const canRecordSound = (): boolean =>
  typeof navigator !== 'undefined' &&
  typeof MediaRecorder !== 'undefined' &&
  !!navigator.mediaDevices &&
  typeof navigator.mediaDevices.getUserMedia === 'function';

const noopSubscribe = () => () => {};

/**
 * {@link canRecordSound} for render: false on the server and during hydration (the server cannot know), the browser's
 * answer after it, so the server's HTML and the first client render agree.
 */
export function useCanRecordSound(): boolean {
  return useSyncExternalStore(noopSubscribe, canRecordSound, () => false);
}

/**
 * The microphone half of the card form's sound field (s10-02): `start` asks for the microphone and records, `stop`
 * (or 15 seconds) ends it and hands the finished recording to `onRecorded`. `elapsed` (milliseconds) is state that
 * ticks only while recording, from a timer that exists only while recording; nothing runs at rest. Leaving the form
 * lets go of the microphone and stops any playback. It never talks to the server: the caller uploads the blob.
 */
export function useCardSoundRecorder(handlers: {
  onRecorded: (blob: Blob, durationMs: number) => void;
  onDenied: () => void;
}): { recording: boolean; elapsed: number; start: () => Promise<void>; stop: () => void } {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedRef = useRef(0);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => {
      const ms = Date.now() - startedRef.current;
      setElapsed(Math.min(ms, CARD_SOUND_MAX_MS));
      if (ms >= CARD_SOUND_MAX_MS) recorderRef.current?.stop();
    }, 250);
    return () => clearInterval(timer);
  }, [recording]);

  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      stopCardSound();
    },
    [],
  );

  const start = useCallback(async () => {
    stopCardSound();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        const durationMs = Date.now() - startedRef.current;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        recorderRef.current = null;
        setRecording(false);
        handlersRef.current.onRecorded(blob, Math.min(durationMs, CARD_SOUND_MAX_MS));
      };
      recorderRef.current = recorder;
      startedRef.current = Date.now();
      setElapsed(0);
      recorder.start();
      setRecording(true);
    } catch {
      setRecording(false);
      handlersRef.current.onDenied();
    }
  }, []);

  const stop = useCallback(() => {
    recorderRef.current?.stop();
  }, []);

  return { recording, elapsed, start, stop };
}
