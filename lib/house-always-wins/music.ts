import { asset } from "@/lib/storage/asset";

const TRACKS: Record<string, string> = {
  intro: asset("/music/HAW/loginscreen.mp3"),
  lobby: asset("/music/HAW/lobby.mp3"),
  tense: asset("/music/HAW/haw_ost2.mp3"),
  vault: asset("/music/HAW/haw_ost2.mp3"),
};

const VOL_KEY = "haw-music-vol";
const MUTE_KEY = "haw-music-muted";

function readNum(key: string, def: number): number {
  if (typeof window === "undefined") return def;
  const v = window.localStorage.getItem(key);
  const n = v == null ? def : parseFloat(v);
  return Number.isFinite(n) ? n : def;
}
function readBool(key: string, def: boolean): boolean {
  if (typeof window === "undefined") return def;
  return window.localStorage.getItem(key) === "1" ? true : window.localStorage.getItem(key) === "0" ? false : def;
}

let audio: HTMLAudioElement | null = null;
let currentTrack = "";
let currentKey = "";
let _volume = readNum(VOL_KEY, 0.35);
let _muted = readBool(MUTE_KEY, false);

function applyVolume() {
  if (audio) audio.volume = _muted ? 0 : _volume;
}

export const MusicManager = {
  play(sceneName: string) {
    const src = TRACKS[sceneName];
    if (!src) return;
    if (currentTrack === src && audio && !audio.paused) return;

    this.stop();
    audio = new Audio(src);
    audio.loop = true;
    audio.volume = _muted ? 0 : _volume;
    audio.play().catch(() => {});
    currentTrack = src;
    currentKey = sceneName;
  },

  stop() {
    if (audio) {
      audio.pause();
      audio.src = "";
      audio = null;
    }
    currentTrack = "";
    currentKey = "";
  },

  setVolume(v: number) {
    _volume = Math.max(0, Math.min(1, v));
    if (typeof window !== "undefined") window.localStorage.setItem(VOL_KEY, String(_volume));
    applyVolume();
  },
  getVolume(): number {
    return _volume;
  },
  setMuted(m: boolean) {
    _muted = m;
    if (typeof window !== "undefined") window.localStorage.setItem(MUTE_KEY, m ? "1" : "0");
    applyVolume();
  },
  isMuted(): boolean {
    return _muted;
  },
  currentSceneKey(): string {
    return currentKey;
  },

  isPlaying(): boolean {
    return !!audio && !audio.paused;
  },
};
