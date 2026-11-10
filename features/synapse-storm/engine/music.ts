/**
 * Background music for Synapse Storm.
 * Track: "When You Find Me" by Plenka
 * Place the audio file at: public/music/synapse-storm/when-you-find-me.mp3
 */

import { Howl } from 'howler';
import { asset } from '@/lib/storage/asset';

const TRACK_PATH = asset('/music/synapse-storm/when-you-find-me.mp3');

let howl: Howl | null = null;
let _volume = 0.25;

export const synapseStormMusic = {
    play(): void {
        this.stop();
        howl = new Howl({
            src: [TRACK_PATH],
            loop: true,
            volume: _volume,
            html5: false, // use Web Audio - shares unlock with SFX when user clicks start
            onloaderror: () => {
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn('[Synapse Storm] Music failed to load. Ensure when-you-find-me.mp3 exists in public/music/synapse-storm/');
                }
            },
            onplayerror: (_id, err) => {
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn('[Synapse Storm] Music play blocked:', err);
                }
                howl?.once('unlock', () => howl?.play());
            },
        });
        howl.play();
    },

    stop(): void {
        if (howl) {
            howl.stop();
            howl.unload();
            howl = null;
        }
    },

    setVolume(v: number): void {
        _volume = Math.max(0, Math.min(1, v));
        if (howl) howl.volume(_volume);
    },

    getVolume(): number {
        return _volume;
    },
};
