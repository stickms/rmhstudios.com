import { asset } from "@/lib/storage/asset";

const TRACKS: Record<string, string> = {
  intro: asset("/music/HAW/loginscreen.mp3"),
  lobby: asset("/music/HAW/lobby.mp3"),
  tense: asset("/music/HAW/haw_ost2.mp3"),
  vault: asset("/music/HAW/haw_ost2.mp3"),
};

let audio: HTMLAudioElement | null = null;
let currentTrack = "";
let _volume = 0.35;

export const MusicManager = {
  play(sceneName: string) {
    const src = TRACKS[sceneName];
    if (!src) return;
    if (currentTrack === src && audio && !audio.paused) return;

    this.stop();
    audio = new Audio(src);
    audio.loop = true;
    audio.volume = _volume;
    audio.play().catch(() => {});
    currentTrack = src;
  },

  stop() {
    if (audio) {
      audio.pause();
      audio.src = "";
      audio = null;
    }
    currentTrack = "";
  },

  setVolume(v: number) {
    _volume = Math.max(0, Math.min(1, v));
    if (audio) audio.volume = _volume;
  },

  getVolume(): number {
    return _volume;
  },

  isPlaying(): boolean {
    return !!audio && !audio.paused;
  },
};
