'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Square, Trash2, Send, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useSession } from '@/components/Providers';
import type { Tier } from '@/lib/entitlements/tiers';
import { limitsFor } from '@/lib/media/voice-policy';
import { formatDuration, VOICE_PEAK_BUCKETS } from '@/lib/voice/peaks';
import { canRecordVoice, VoiceRecorder, VoiceRecorderError } from '@/lib/voice/recorder';
import { VoiceWaveform } from '@/components/voice/VoiceWaveform';
import { VoicePlayer } from '@/components/voice/VoicePlayer';

/**
 * Record → review → send, for a DM voice note.
 *
 * ## Why there is a review step
 *
 * Press-and-hold-to-send (the WhatsApp gesture) sends whatever was captured the
 * instant the finger lifts, including the half-second of "wait, no—". A voice
 * note is the one message type you cannot skim before sending, so this stops at
 * a preview: play it back, add the text note, then send or throw away.
 *
 * ## Why the text note is here and not optional-looking
 *
 * A voice message is unreadable to a deaf recipient and unskimmable to everyone
 * else, and this site has no transcription model. The note field is therefore
 * part of the send step rather than an afterthought — it is the only path from
 * audio to text this feature has. It is not *enforced*, because refusing to send
 * a recording somebody already made helps nobody, but it is always in front of
 * them, prefilled focus and all.
 *
 * The panel replaces the text composer while it is open (the parent hides it via
 * `onActiveChange`), which is what keeps this usable at 360px.
 */

export interface SentVoiceMessage {
  id: string;
  content: string;
  senderId: string;
  read: boolean;
  createdAt: string;
  audioUrl: string | null;
  audioDurationMs: number | null;
  audioPeaks: number[];
}

export function VoiceComposer({
  conversationId,
  onSent,
  onActiveChange,
  disabled = false,
}: {
  conversationId: string;
  onSent: (message: SentVoiceMessage) => void;
  onActiveChange?: (active: boolean) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation('feed');
  const { data: session } = useSession();
  const reducedMotion = useReducedMotion();

  const tier = ((session?.user as { tier?: string | null } | undefined)?.tier ?? 'free') as Tier;
  const limits = limitsFor(tier);

  const recorderRef = useRef<VoiceRecorder | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const [phase, setPhase] = useState<'idle' | 'recording' | 'review' | 'sending'>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [livePeaks, setLivePeaks] = useState<number[]>([]);
  const [clip, setClip] = useState<{
    blob: Blob;
    contentType: string;
    durationMs: number;
    peaks: number[];
  } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const active = phase !== 'idle';
  useEffect(() => {
    onActiveChange?.(active);
  }, [active, onActiveChange]);

  const releasePreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewUrl(null);
  }, []);

  // The microphone must not survive this component. An unmount mid-recording
  // (route change, conversation switch) otherwise leaves the browser's recording
  // indicator lit with nothing on screen explaining it.
  useEffect(() => {
    return () => {
      recorderRef.current?.cancel();
      recorderRef.current = null;
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const reset = useCallback(() => {
    recorderRef.current?.cancel();
    recorderRef.current = null;
    releasePreview();
    setClip(null);
    setNote('');
    setElapsedMs(0);
    setLivePeaks([]);
    setPhase('idle');
  }, [releasePreview]);

  const startRecording = useCallback(async () => {
    if (!canRecordVoice()) {
      toast.error(
        t('voice-unsupported', {
          defaultValue: 'This browser cannot record audio.',
        }),
      );
      return;
    }

    const recorder = new VoiceRecorder(tier, {
      onTick: (level, elapsed) => {
        setElapsedMs(elapsed);
        // A rolling window of the most recent frames — the live bars show what
        // is being said now, not a compressed history of the whole take.
        setLivePeaks((prev) => [...prev, level].slice(-VOICE_PEAK_BUCKETS));
      },
      onAutoStop: () => {
        toast.info(
          t('voice-limit-reached', {
            defaultValue: 'Recording stopped at your plan’s length limit.',
          }),
        );
      },
      onError: () => {
        toast.error(t('voice-record-failed', { defaultValue: 'Recording failed.' }));
        reset();
      },
    });

    try {
      await recorder.start();
    } catch (err) {
      const reason = err instanceof VoiceRecorderError ? err.reason : 'failed';
      toast.error(
        reason === 'denied'
          ? t('voice-permission-denied', {
              defaultValue: 'Microphone access was denied.',
            })
          : t('voice-record-failed', { defaultValue: 'Recording failed.' }),
      );
      return;
    }

    recorderRef.current = recorder;
    setElapsedMs(0);
    setLivePeaks([]);
    setPhase('recording');
  }, [reset, t, tier]);

  const stopRecording = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    const result = await recorder.stop();
    recorderRef.current = null;
    if (!result || result.durationMs < 400) {
      // Anything under ~0.4s is a mis-tap, not a message.
      toast.info(t('voice-too-short', { defaultValue: 'That recording was too short.' }));
      reset();
      return;
    }
    const url = URL.createObjectURL(result.blob);
    previewUrlRef.current = url;
    setPreviewUrl(url);
    setClip(result);
    setPhase('review');
  }, [reset, t]);

  const send = useCallback(async () => {
    if (!clip) return;
    setPhase('sending');
    try {
      const form = new FormData();
      form.append('audio', clip.blob, 'voice');
      form.append('durationMs', String(Math.round(clip.durationMs)));
      form.append('peaks', JSON.stringify(clip.peaks));
      form.append('note', note.trim());

      const res = await fetch(`/api/messages/${encodeURIComponent(conversationId)}/voice`, {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // The server names the caller's own ceiling ("60 seconds on your plan"),
        // so its message is more useful than anything generic here.
        toast.error(
          data.error || t('voice-send-failed', { defaultValue: 'Could not send that recording.' }),
        );
        setPhase('review');
        return;
      }
      onSent(data.message as SentVoiceMessage);
      reset();
    } catch {
      toast.error(t('voice-send-failed', { defaultValue: 'Could not send that recording.' }));
      setPhase('review');
    }
  }, [clip, conversationId, note, onSent, reset, t]);

  if (!active) {
    return (
      <button
        type="button"
        onClick={startRecording}
        disabled={disabled}
        aria-label={t('voice-record', { defaultValue: 'Record a voice message' })}
        className="flex size-11 shrink-0 items-center justify-center rounded-site text-site-text-dim transition-colors hover:bg-site-surface-hover hover:text-site-accent disabled:opacity-50"
      >
        <Mic className="size-5" />
      </button>
    );
  }

  const remainingMs = Math.max(0, limits.maxDurationMs - elapsedMs);

  return (
    <div className="w-full min-w-0">
      {phase === 'recording' ? (
        <div className="flex w-full min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            // The only motion here, and it is the one signal that says "this is
            // live". Reduced motion gets a static dot instead of nothing, so the
            // state is still legible.
            className={`size-2.5 shrink-0 rounded-full bg-site-danger ${
              reducedMotion ? '' : 'animate-pulse'
            }`}
          />
          <span className="shrink-0 text-xs tabular-nums text-site-text" role="timer">
            {formatDuration(elapsedMs)}
          </span>
          <div className="min-w-0 flex-1 text-site-accent">
            <VoiceWaveform peaks={livePeaks} progress={1} />
          </div>
          <span className="shrink-0 text-[11px] tabular-nums text-site-text-dim">
            −{formatDuration(remainingMs)}
          </span>
          <button
            type="button"
            onClick={reset}
            aria-label={t('voice-cancel', { defaultValue: 'Discard recording' })}
            className="flex size-11 shrink-0 items-center justify-center rounded-site text-site-text-dim transition-colors hover:bg-site-surface-hover hover:text-site-danger"
          >
            <Trash2 className="size-4" />
          </button>
          <Button
            variant="accent"
            size="sm"
            onClick={stopRecording}
            className="h-11 shrink-0 rounded-site px-3"
            aria-label={t('voice-stop', { defaultValue: 'Stop recording' })}
          >
            <Square className="size-4" />
          </Button>
        </div>
      ) : (
        <div className="flex w-full min-w-0 flex-col gap-2">
          {previewUrl && (
            <div className="text-site-text">
              <VoicePlayer
                src={previewUrl}
                durationMs={clip?.durationMs ?? null}
                peaks={clip?.peaks ?? []}
              />
            </div>
          )}
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={2000}
            placeholder={t('voice-note-placeholder', {
              defaultValue: 'Add a short text note (helps anyone who can’t listen)',
            })}
            aria-label={t('voice-note-label', { defaultValue: 'Text note for this voice message' })}
          />
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={reset}
              disabled={phase === 'sending'}
              className="h-11 rounded-site"
            >
              <Trash2 className="size-4" />
              {t('voice-discard', { defaultValue: 'Discard' })}
            </Button>
            <Button
              variant="accent"
              size="sm"
              onClick={send}
              disabled={phase === 'sending'}
              className="h-11 rounded-site"
            >
              {phase === 'sending' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              {t('voice-send', { defaultValue: 'Send' })}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
