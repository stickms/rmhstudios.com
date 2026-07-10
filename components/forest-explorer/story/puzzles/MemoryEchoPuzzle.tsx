'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { PuzzleComponentProps } from './PuzzleRegistry';

const SOUND_ICONS: Record<string, string> = {
    owl: '🦉',
    wind: '💨',
    creek: '💧',
    rustle: '🍃',
    birdsong: '🐦',
    thunder: '⚡',
};

const SOUND_COLORS: Record<string, string> = {
    owl: '#8844aa',
    wind: '#44aa88',
    creek: '#4488cc',
    rustle: '#88aa44',
    birdsong: '#cc8844',
    thunder: '#aa4444',
};

/** Synthesized voice per forest sound — the puzzle is audible, not just visual */
function playForestSound(ctx: AudioContext, sound: string, duration = 0.55) {
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = 0.28;
    master.connect(ctx.destination);

    const tone = (freq: number, type: OscillatorType, start: number, len: number, peak = 1, glideTo?: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, now + start);
        if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, now + start + len);
        gain.gain.setValueAtTime(0, now + start);
        gain.gain.linearRampToValueAtTime(peak, now + start + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + start + len);
        osc.connect(gain);
        gain.connect(master);
        osc.start(now + start);
        osc.stop(now + start + len + 0.05);
    };

    const noise = (start: number, len: number, filterFreq: number, peak = 0.8) => {
        const bufferSize = Math.ceil(ctx.sampleRate * len);
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = filterFreq;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now + start);
        gain.gain.linearRampToValueAtTime(peak, now + start + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, now + start + len);
        src.connect(filter);
        filter.connect(gain);
        gain.connect(master);
        src.start(now + start);
    };

    switch (sound) {
        case 'owl':
            // Two soft low hoots
            tone(392, 'sine', 0, duration * 0.4, 0.9, 330);
            tone(370, 'sine', duration * 0.45, duration * 0.5, 0.9, 300);
            break;
        case 'wind':
            // Airy filtered noise sweep
            noise(0, duration, 700, 0.55);
            break;
        case 'creek':
            // Bubbling high blips over soft noise
            noise(0, duration, 2400, 0.25);
            tone(880, 'sine', 0.05, 0.12, 0.5, 1245);
            tone(988, 'sine', 0.22, 0.12, 0.45, 1319);
            tone(784, 'sine', 0.38, 0.12, 0.4, 1047);
            break;
        case 'rustle':
            // Crisp short noise flutters
            noise(0, duration * 0.3, 5000, 0.4);
            noise(duration * 0.35, duration * 0.3, 4500, 0.35);
            noise(duration * 0.7, duration * 0.25, 5500, 0.3);
            break;
        case 'birdsong':
            // Quick rising chirps
            tone(1568, 'sine', 0, 0.1, 0.6, 2093);
            tone(1760, 'sine', 0.16, 0.1, 0.6, 2349);
            tone(1568, 'sine', 0.32, 0.14, 0.55, 2637);
            break;
        case 'thunder':
            // Deep rumble
            noise(0, duration * 1.4, 140, 1.0);
            tone(55, 'sine', 0, duration * 1.2, 0.8, 38);
            break;
        default:
            tone(440, 'sine', 0, duration, 0.7);
    }
}

export function MemoryEchoPuzzle({ config, onSolve, onAttempt }: PuzzleComponentProps) {
    const { t } = useTranslation("c-forest-explorer");
    const sounds = (config.sounds as string[]) ?? ['owl', 'wind', 'creek', 'rustle', 'birdsong', 'thunder'];
    const seqLength = (config.sequenceLength as number) ?? 5;
    const playbackSpeed = (config.playbackSpeed as number) ?? 1.0;

    const noteMs = 700 / playbackSpeed;
    const gapMs = 300 / playbackSpeed;

    const [sequence] = useState<number[]>(() => {
        const seq: number[] = [];
        for (let i = 0; i < seqLength; i++) {
            seq.push(Math.floor(Math.random() * sounds.length));
        }
        return seq;
    });

    const [phase, setPhase] = useState<'idle' | 'playing' | 'input' | 'correct' | 'wrong'>('idle');
    const [playingIndex, setPlayingIndex] = useState(-1);
    const [playerInput, setPlayerInput] = useState<number[]>([]);

    const audioCtxRef = useRef<AudioContext | null>(null);
    const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

    // Stop timers + audio context on unmount
    useEffect(() => () => {
        timersRef.current.forEach(clearTimeout);
        audioCtxRef.current?.close().catch(() => {});
    }, []);

    const getAudioCtx = () => {
        if (!audioCtxRef.current) {
            type AudioCtor = typeof AudioContext;
            const Ctor: AudioCtor | undefined =
                window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
            if (Ctor) audioCtxRef.current = new Ctor();
        }
        if (audioCtxRef.current?.state === 'suspended') {
            audioCtxRef.current.resume().catch(() => {});
        }
        return audioCtxRef.current;
    };

    const playSound = useCallback((soundIdx: number) => {
        const ctx = getAudioCtx();
        if (ctx) playForestSound(ctx, sounds[soundIdx], 0.55 / playbackSpeed);
    }, [sounds, playbackSpeed]);

    const playSequence = useCallback(() => {
        setPhase('playing');
        setPlayerInput([]);
        timersRef.current.forEach(clearTimeout);
        timersRef.current = [];

        sequence.forEach((soundIdx, i) => {
            const startAt = 300 + i * (noteMs + gapMs);
            timersRef.current.push(setTimeout(() => {
                setPlayingIndex(soundIdx);
                playSound(soundIdx);
            }, startAt));
            timersRef.current.push(setTimeout(() => {
                setPlayingIndex(-1);
            }, startAt + noteMs));
        });

        const endAt = 300 + sequence.length * (noteMs + gapMs) + 200;
        timersRef.current.push(setTimeout(() => {
            setPlayingIndex(-1);
            setPhase('input');
        }, endAt));
    }, [sequence, noteMs, gapMs, playSound]);

    const handleSoundClick = (idx: number) => {
        if (phase !== 'input') return;

        const newInput = [...playerInput, idx];
        setPlayerInput(newInput);

        // Flash the button and let the player hear their answer
        setPlayingIndex(idx);
        playSound(idx);
        timersRef.current.push(setTimeout(() => setPlayingIndex(-1), 200));

        const pos = newInput.length - 1;
        if (newInput[pos] !== sequence[pos]) {
            setPhase('wrong');
            onAttempt();
            timersRef.current.push(setTimeout(() => setPhase('idle'), 1200));
            return;
        }

        if (newInput.length === sequence.length) {
            setPhase('correct');
            timersRef.current.push(setTimeout(onSolve, 800));
        }
    };

    return (
        <div className="w-full max-w-md mx-auto space-y-6">
            <div className="text-center">
                {phase === 'idle' && (
                    <p className="text-white/50 text-sm">{t("press-play-prompt", { defaultValue: "Press play to hear the forest's memory" })}</p>
                )}
                {phase === 'playing' && (
                    <p className="text-blue-300 text-sm">{t("listen-carefully", { defaultValue: "Listen carefully..." })}</p>
                )}
                {phase === 'input' && (
                    <p className="text-white/60 text-sm">
                        {t("replay-sounds", { defaultValue: "Replay the sounds ({{current}}/{{total}})", current: playerInput.length, total: sequence.length })}
                    </p>
                )}
                {phase === 'wrong' && (
                    <p className="text-red-400 text-sm">{t("incorrect-sequence", { defaultValue: "Incorrect sequence. Try again." })}</p>
                )}
                {phase === 'correct' && (
                    <p className="text-green-400 text-sm font-medium">{t("forest-remembers", { defaultValue: "The forest remembers!" })}</p>
                )}
            </div>

            {/* Sound buttons */}
            <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto">
                {sounds.map((sound, i) => {
                    const isActive = playingIndex === i;
                    return (
                        <button
                            key={sound}
                            className={`aspect-square rounded-xl flex flex-col items-center justify-center gap-1 transition-all duration-200 cursor-pointer border-2 ${
                                isActive
                                    ? 'scale-105 shadow-lg border-opacity-80'
                                    : phase === 'input'
                                        ? 'hover:scale-102 border-white/15 hover:border-white/30'
                                        : 'border-white/10'
                            }`}
                            style={{
                                backgroundColor: isActive ? `${SOUND_COLORS[sound]}40` : 'rgba(255,255,255,0.05)',
                                borderColor: isActive ? SOUND_COLORS[sound] : undefined,
                            }}
                            onClick={() => handleSoundClick(i)}
                            disabled={phase !== 'input'}
                        >
                            <span className="text-2xl">{SOUND_ICONS[sound] ?? '🔊'}</span>
                            <span className="text-[10px] text-white/40 capitalize">{sound}</span>
                        </button>
                    );
                })}
            </div>

            {/* Progress dots */}
            <div className="flex justify-center gap-2">
                {sequence.map((_, i) => (
                    <div
                        key={i}
                        className={`w-3 h-3 rounded-full transition-colors ${
                            i < playerInput.length
                                ? playerInput[i] === sequence[i]
                                    ? 'bg-green-400'
                                    : 'bg-red-400'
                                : 'bg-white/20'
                        }`}
                    />
                ))}
            </div>

            {/* Play button */}
            {(phase === 'idle' || phase === 'wrong') && (
                <div className="flex justify-center">
                    <button
                        className="px-6 py-2.5 bg-blue-800/50 hover:bg-blue-700/50 border border-blue-600/30 text-blue-200 rounded-xl text-sm font-medium cursor-pointer"
                        onClick={playSequence}
                    >
                        {t("play-sequence", { defaultValue: "▶ Play Sequence" })}
                    </button>
                </div>
            )}
        </div>
    );
}
