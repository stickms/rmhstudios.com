/**
 * Music controller: plays external BGM files (via Howler) when the manifest
 * provides a track URL, and falls back to the built-in procedural synth
 * otherwise. Switching to a track that maps to the same file keeps playing
 * seamlessly (e.g. stage → boss using one looping theme).
 */

import { Howl } from 'howler';
import { Music, type MusicTrack } from './music';

export interface MusicLike {
    resume(): Promise<void>;
    setEnabled(on: boolean): void;
    setVolume(v: number): void;
    play(track: MusicTrack): void;
    stop(): void;
    dispose(): void;
    getTrack(): MusicTrack | null;
}

export class MusicController implements MusicLike {
    private proc = new Music();
    private tracks: Partial<Record<string, string>> = {};
    private howl: Howl | null = null;
    private currentUrl: string | null = null;
    private current: MusicTrack | null = null;
    private enabled = true;
    private volume = 0.6;

    /** Provide the manifest's `music` map (track → file url). */
    setTracks(map?: Partial<Record<string, string>>): void {
        this.tracks = map ?? {};
    }

    async resume(): Promise<void> {
        await this.proc.resume();
    }

    setEnabled(on: boolean): void {
        this.enabled = on;
        this.proc.setEnabled(on);
        if (this.howl) {
            if (!on) this.howl.pause();
            else if (this.current && this.tracks[this.current] && !this.howl.playing()) this.howl.play();
        }
    }

    setVolume(v: number): void {
        this.volume = v;
        this.proc.setVolume(v);
        this.howl?.volume(v);
    }

    getTrack(): MusicTrack | null {
        return this.current;
    }

    play(track: MusicTrack): void {
        this.current = track;
        const url = this.tracks[track];
        if (url) {
            this.proc.stop();
            if (this.currentUrl === url && this.howl) {
                if (this.enabled && !this.howl.playing()) this.howl.play();
                return;
            }
            this.howl?.stop();
            this.howl?.unload();
            const src = [url];
            if (url.endsWith('.ogg')) src.push(url.replace(/\.ogg$/, '.mp3'));
            this.howl = new Howl({ src, loop: true, volume: this.volume, html5: false });
            this.currentUrl = url;
            if (this.enabled) this.howl.play();
        } else {
            this.howl?.stop();
            this.currentUrl = null;
            this.proc.play(track);
        }
    }

    stop(): void {
        this.howl?.stop();
        this.proc.stop();
        this.current = null;
    }

    dispose(): void {
        this.howl?.stop();
        this.howl?.unload();
        this.howl = null;
        this.proc.dispose();
    }
}
