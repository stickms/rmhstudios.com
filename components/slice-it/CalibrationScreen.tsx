import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { outputLatencyMs } from '@/lib/shared/platform';
import { useSliceItStore } from '@/lib/slice-it/store';
import { AudioManager } from '@/lib/audio/AudioManager';

export function CalibrationScreen({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation('c-game');
  const { audioOffset, setAudioOffset } = useSliceItStore();
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [beats, setBeats] = React.useState<number[]>([]);
  const [tempOffset, setTempOffset] = React.useState(audioOffset);
  const [message, setMessage] = React.useState(
    t('tap-to-beat', { defaultValue: 'Tap the button or SPACE to the beat!' }),
  );

  // Metronome logic
  const intervalRef = React.useRef<NodeJS.Timeout | null>(null);
  const lastBeatTime = React.useRef<number>(0);
  /** Above this, the delay is almost certainly a wireless link rather than a
   *  buffer, and no offset setting fixes how it feels to play. */
  const BLUETOOTH_LATENCY_HINT_MS = 80;
  /** The store clamps to +/-500ms; mirror it so the button cannot offer a value
   *  the setter will silently refuse. */
  const clampOffset = (ms: number) => Math.max(-500, Math.min(500, Math.round(ms)));
  const BPM = 120;
  const BEAT_MS = 60000 / BPM;

  const [beatFlash, setBeatFlash] = React.useState(false);

  /**
   * A6 — the latency the audio stack reports about itself.
   *
   * Read once on mount rather than per render: it is a property of the output
   * device, and re-reading it every frame would be a `getContext()` call on a
   * screen that is otherwise idle. Null when the browser will not say (Safari
   * reports 0, which is not the same as "none" and is treated as unknown).
   */
  const [detectedLatency] = React.useState(() => outputLatencyMs());

  const startMetronome = () => {
    if (isPlaying) return;
    // Ensure AudioContext is initialized before trying to use it
    AudioManager.getInstance().initialize();
    setIsPlaying(true);
    setBeats([]);

    // Play simple click sound or oscillator
    const playClick = () => {
      const ctx = AudioManager.getInstance().getContext();
      if (ctx) {
        if (ctx.state === 'suspended') ctx.resume();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 800;
        const when = ctx.currentTime;
        gain.gain.setValueAtTime(0.5, when);
        gain.gain.exponentialRampToValueAtTime(0.01, when + 0.1);
        osc.start(when);
        osc.stop(when + 0.1);
        // The click is HEARD an output-latency after it is scheduled, and the game's
        // clock already follows what is heard. Measure the tap against that moment,
        // so the offset saved here is the player's own bias and not their headphones'.
        lastBeatTime.current = AudioManager.getInstance().heardPerfTime(when);
      } else {
        lastBeatTime.current = performance.now();
      }
      // Visual beat flash
      setBeatFlash(true);
      setTimeout(() => setBeatFlash(false), 80);
    };

    playClick(); // First beat
    intervalRef.current = setInterval(playClick, BEAT_MS);
  };

  const stopMetronome = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setIsPlaying(false);
    setMessage(t('calibration-stopped', { defaultValue: 'Calibration stopped.' }));
  };

  const handleTap = React.useCallback(() => {
    if (!isPlaying) return;

    const now = performance.now();
    const diff = now - lastBeatTime.current;

    // Calculate offset (how late/early the tap was relative to the beat)
    // We assume the user taps *after* hearing the beat, but maybe they anticipate.
    // If they tap 100ms after the beat sound, it implies there's audio latency
    // OR visual latency OR input latency.
    // Typically, "offset" means we shift the music/map.
    // If user taps late (positive diff), we might want to delay the notes (or advance the music reading).
    // Let's assume audioOffset is added to song time.

    // Normalize diff to be relative to the closest beat
    // If tap is 490ms after beat (and interval is 500ms), they missed the previous one and are 10ms early for next.
    // If tap is 10ms after beat, they are 10ms late.

    let delta = diff;
    if (delta > BEAT_MS / 2) {
      delta -= BEAT_MS; // Early for next beat
    }

    setBeats((prev) => [...prev.slice(-19), delta]); // Keep last 20

    // Running average
    const avg = Math.round([...beats, delta].reduce((a, b) => a + b, 0) / (beats.length + 1));
    setTempOffset(avg);
    setMessage(t('average-offset', { defaultValue: 'Average Offset: {{avg}}ms', avg }));
  }, [isPlaying, beats]);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        handleTap();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleTap]);

  // Cleanup
  React.useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const saveAndBack = () => {
    setAudioOffset(tempOffset);
    onBack();
  };

  return (
    <div className="slice-screen absolute inset-0 z-60 flex items-center-safe justify-center-safe overflow-y-auto overscroll-contain bg-slice-bg p-4">
      <Card className="w-full max-w-md bg-slice-bg text-slice-text border border-slice-border">
        <CardHeader>
          <CardTitle className="text-2xl font-black text-center text-slice-text-darker">
            {t('audio-calibration', { defaultValue: 'AUDIO CALIBRATION' })}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 text-center">
          <p className="text-slice-text-muted text-sm">
            {t('listen-instruction', {
              defaultValue:
                'Listen to the beat and tap SPACE or the button exactly when you hear it.',
            })}
          </p>

          <div
            className={`bg-slice-bg p-8 rounded-full w-48 h-48 mx-auto flex items-center justify-center transition duration-75 ${beatFlash ? 'border border-slice-border' : 'border border-slice-border'}`}
          >
            <Button
              className={`w-32 h-32 rounded-full font-bold text-xl border border-slice-border transition ${isPlaying ? 'bg-blue-500 text-white' : 'bg-slice-bg text-slice-text-muted'} ${beatFlash ? 'scale-95' : 'scale-100'}`}
              onClick={isPlaying ? handleTap : startMetronome}
            >
              {isPlaying
                ? t('tap', { defaultValue: 'TAP!' })
                : t('start', { defaultValue: 'START' })}
            </Button>
          </div>

          <div className="space-y-2">
            <div className="text-3xl font-mono font-bold text-slice-text">{tempOffset} ms</div>
            <div className="text-xs text-slice-text-light font-bold uppercase">{message}</div>
          </div>

          {/* A6 — what the audio stack is costing, before the player guesses at
              it. Bluetooth adds 100-300ms and there is otherwise nothing on
              this screen that would tell them that is what is wrong. */}
          {detectedLatency !== null && (
            <div className="neumorphic-inset px-4 py-3 text-left text-xs space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-slice-text-muted">
                  {t('detected-output-latency', { defaultValue: 'Detected audio output delay' })}
                </span>
                <span className="font-mono font-bold text-slice-text">{detectedLatency} ms</span>
              </div>
              {detectedLatency > BLUETOOTH_LATENCY_HINT_MS && (
                <p className="text-slice-text-light">
                  {t('bluetooth-latency-hint', {
                    defaultValue:
                      'That is wireless-headphone territory. Wired output will feel much tighter than any offset can compensate for.',
                  })}
                </p>
              )}
              <button
                type="button"
                className="neumorphic-sm w-full px-3 py-2 font-bold text-slice-primary"
                onClick={() => setTempOffset(clampOffset(-detectedLatency))}
              >
                {t('use-detected-latency', {
                  defaultValue: 'Start from this ({{ms}} ms)',
                  ms: -detectedLatency,
                })}
              </button>
            </div>
          )}

          <div className="flex gap-4">
            <Button
              variant="ghost"
              className="flex-1 bg-slice-bg text-slice-text-muted border border-slice-border rounded-xl"
              onClick={stopMetronome}
              disabled={!isPlaying}
            >
              {t('stop', { defaultValue: 'STOP' })}
            </Button>
            <Button
              variant="ghost"
              className="flex-1 bg-slice-bg text-slice-text-muted border border-slice-border rounded-xl"
              onClick={() => {
                setTempOffset(0);
                setBeats([]);
              }}
            >
              {t('reset', { defaultValue: 'RESET' })}
            </Button>
          </div>

          {/*
            The tap test above measures this device with a metronome. This reads
            the same latency out of runs the player has actually finished, which
            is the more honest measurement — it is taken under the conditions
            the offset has to be right for.
          */}
          <div className="flex gap-4 pt-4 border-t border-slice-shadow-dark/30">
            <Button variant="ghost" className="flex-1 text-slice-text-muted" onClick={onBack}>
              {t('cancel', { defaultValue: 'CANCEL' })}
            </Button>
            <Button
              className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-xl"
              onClick={saveAndBack}
            >
              {t('save-and-exit', { defaultValue: 'SAVE & EXIT' })}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
