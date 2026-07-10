"use client";

import { useState, useEffect, useCallback } from "react";
import { MusicManager } from "@/lib/house-always-wins/music";
import { SfxManager } from "@/lib/house-always-wins/sfx";
import { useHouseAlwaysWinsStore } from "@/lib/store/houseAlwaysWinsStore";
import { OBJECTIVES } from "@/lib/house-always-wins/quests";
import { Check, Volume2, VolumeX, Music, Music2 } from "lucide-react";

interface MenuOverlayProps {
  open: boolean;
  onClose: () => void;
}

export function MenuOverlay({ open, onClose }: MenuOverlayProps) {
  const [musicVol, setMusicVol] = useState(() => MusicManager.getVolume());
  const [musicMuted, setMusicMuted] = useState(() => MusicManager.isMuted());
  const [sfxVol, setSfxVol] = useState(() => SfxManager.getVolume());
  const [sfxMuted, setSfxMuted] = useState(() => SfxManager.isMuted());
  const debt = useHouseAlwaysWinsStore((s) => s.debt);
  const chips = useHouseAlwaysWinsStore((s) => s.chips);
  const keys = useHouseAlwaysWinsStore((s) => s.keys);
  const abilities = useHouseAlwaysWinsStore((s) => s.abilities);
  const flags = useHouseAlwaysWinsStore((s) => s.flags);
  const resetRun = useHouseAlwaysWinsStore((s) => s.resetRun);

  const qs = { debt, chips, keys, abilities, flags };

  const handleMusicVol = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setMusicVol(v);
    MusicManager.setVolume(v);
    if (v > 0 && MusicManager.isMuted()) {
      MusicManager.setMuted(false);
      setMusicMuted(false);
    }
  }, []);
  const toggleMusicMute = useCallback(() => {
    const m = !MusicManager.isMuted();
    MusicManager.setMuted(m);
    setMusicMuted(m);
  }, []);
  const handleSfxVol = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setSfxVol(v);
    SfxManager.setVolume(v);
    if (SfxManager.isMuted() && v > 0) {
      SfxManager.setMuted(false);
      setSfxMuted(false);
    }
    SfxManager.play("ui");
  }, []);
  const toggleSfxMute = useCallback(() => {
    const m = !SfxManager.isMuted();
    SfxManager.setMuted(m);
    setSfxMuted(m);
    if (!m) SfxManager.play("ui");
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.code === "KeyM" || e.code === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const confirmReset = () => {
    if (window.confirm("Abandon this run? All progress, keys and chips are lost.")) {
      resetRun();
      window.location.reload();
    }
  };

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/85 backdrop-blur-sm">
      <div className="w-[26rem] max-w-[92vw] rounded-xl border border-[#2a2520] bg-[#0d0a10] p-6 shadow-2xl">
        <h2 className="mb-1 text-center text-lg font-bold tracking-wide text-[#f0c674]">
          The House Always Wins
        </h2>
        <p className="mb-5 text-center font-mono text-[10px] tracking-[0.3em] text-[#6b6155] uppercase">
          Paused
        </p>

        {/* Objective log */}
        <div className="mb-5">
          <div className="mb-2 font-mono text-[10px] tracking-widest text-[#8b6914] uppercase">
            Objectives
          </div>
          <ul className="max-h-44 space-y-1 overflow-y-auto pr-1">
            {OBJECTIVES.map((o) => {
              const done = o.done(qs);
              return (
                <li
                  key={o.id}
                  className={`flex items-start gap-2 text-xs leading-snug ${
                    done ? "text-[#5fd2a0]/70 line-through" : "text-[#cabba0]"
                  }`}
                >
                  <span className="mt-0.5 shrink-0">
                    {done ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <span className="inline-block h-3 w-3 rounded-full border border-[#6b6155]" />
                    )}
                  </span>
                  {o.text}
                </li>
              );
            })}
          </ul>
        </div>

        {/* Settings — audio */}
        <div className="mb-4">
          <div className="mb-2 font-mono text-[10px] tracking-widest text-[#8b6914] uppercase">
            Settings
          </div>

          {/* Music */}
          <div className="mb-2.5 flex items-center gap-3">
            <button
              onClick={toggleMusicMute}
              title={musicMuted ? "Unmute music" : "Mute music"}
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded ${
                musicMuted ? "text-[#6b6155]" : "text-[#d4a054]"
              } hover:bg-white/5`}
            >
              {musicMuted ? <Music2 className="h-4 w-4" /> : <Music className="h-4 w-4" />}
            </button>
            <span className="w-12 font-mono text-[11px] text-[#cabba0]">Music</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={musicMuted ? 0 : musicVol}
              onChange={handleMusicVol}
              className="h-1 flex-1 cursor-pointer appearance-none rounded-lg bg-neutral-700 accent-[#d4a054]"
            />
            <span className="w-7 text-right font-mono text-xs text-[#6b6155]">
              {musicMuted ? "—" : Math.round(musicVol * 100)}
            </span>
          </div>

          {/* SFX */}
          <div className="flex items-center gap-3">
            <button
              onClick={toggleSfxMute}
              title={sfxMuted ? "Unmute sound effects" : "Mute sound effects"}
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded ${
                sfxMuted ? "text-[#6b6155]" : "text-[#5fd2a0]"
              } hover:bg-white/5`}
            >
              {sfxMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <span className="w-12 font-mono text-[11px] text-[#cabba0]">Sound FX</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={sfxMuted ? 0 : sfxVol}
              onChange={handleSfxVol}
              className="h-1 flex-1 cursor-pointer appearance-none rounded-lg bg-neutral-700 accent-[#5fd2a0]"
            />
            <span className="w-7 text-right font-mono text-xs text-[#6b6155]">
              {sfxMuted ? "—" : Math.round(sfxVol * 100)}
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="mb-5 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px] text-[#6b6155]">
          <div>Move — A/D · ←/→</div>
          <div>Jump — Space / K</div>
          <div>Dash — Shift / J</div>
          <div>Interact — E</div>
          <div>Drop down — S / ↓</div>
          <div>Menu — M / Esc</div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-[#d4a054]/30 bg-[#d4a054]/10 py-2 font-mono text-sm text-[#f0c674] transition-colors hover:bg-[#d4a054]/20"
          >
            Resume [M]
          </button>
          <button
            onClick={confirmReset}
            className="rounded-lg border border-[#c0392b]/30 bg-[#c0392b]/10 px-3 py-2 font-mono text-xs text-[#c0392b]/80 transition-colors hover:bg-[#c0392b]/20"
          >
            Abandon Run
          </button>
        </div>
      </div>
    </div>
  );
}
