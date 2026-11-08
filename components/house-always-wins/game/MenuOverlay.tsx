"use client";

import { useTranslation } from "react-i18next";
import { useState, useEffect, useCallback } from "react";
import { MusicManager } from "@/lib/house-always-wins/music";
import { SfxManager } from "@/lib/house-always-wins/sfx";
import { useHouseAlwaysWinsStore } from "@/lib/store/houseAlwaysWinsStore";
import { NgPlusSlot } from "./NgPlus";
import { OBJECTIVES } from "@/lib/house-always-wins/quests";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Check, Volume2, VolumeX, Music, Music2 } from "lucide-react";

interface MenuOverlayProps {
  open: boolean;
  onClose: () => void;
  /** Return to the main menu (the save persists; the run stays paused underneath). */
  onMainMenu: () => void;
}

export function MenuOverlay({ open, onClose, onMainMenu }: MenuOverlayProps) {
  const { t } = useTranslation("c-house-always-wins");
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
  const confirm = useConfirm();

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

  const confirmReset = async () => {
    if (
      await confirm({
        title: t("menu-abandon-confirm", { defaultValue: "Abandon this run? All progress, keys and chips are lost." }),
        danger: true,
      })
    ) {
      resetRun();
      window.location.reload();
    }
  };

  return (
    <div className="app-safe-pad absolute inset-0 z-30 flex items-center-safe justify-center-safe overflow-y-auto bg-black/85 backdrop-blur-sm">
      <div className="w-[26rem] max-w-[92vw] rounded-xl border border-[#2a2520] bg-[#0d0a10] p-6 shadow-2xl">
        <h2 className="mb-1 text-center text-lg font-bold tracking-wide text-[#f0c674]">
          The House Always Wins
        </h2>
        <p className="mb-5 text-center font-mono text-[10px] tracking-[0.3em] text-[#6b6155] uppercase">
          {t("menu-paused", { defaultValue: "Paused" })}
        </p>

        {/* Objective log */}
        <div className="mb-5">
          <div className="mb-2 font-mono text-[10px] tracking-widest text-[#8b6914] uppercase">
            {t("menu-objectives", { defaultValue: "Objectives" })}
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
            {t("menu-settings", { defaultValue: "Settings" })}
          </div>

          {/* Music */}
          <div className="mb-2.5 flex items-center gap-3">
            <button
              onClick={toggleMusicMute}
              title={musicMuted ? t("menu-unmute-music", { defaultValue: "Unmute music" }) : t("menu-mute-music", { defaultValue: "Mute music" })}
              className={`flex h-7 w-7 pointer-coarse:h-11 pointer-coarse:w-11 shrink-0 items-center justify-center rounded ${
                musicMuted ? "text-[#6b6155]" : "text-[#d4a054]"
              } hover:bg-white/5`}
            >
              {musicMuted ? <Music2 className="h-4 w-4" /> : <Music className="h-4 w-4" />}
            </button>
            <span className="w-16 font-mono text-[11px] text-[#cabba0]">{t("menu-music", { defaultValue: "Music" })}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={musicMuted ? 0 : musicVol}
              onChange={handleMusicVol}
              className="h-1 flex-1 cursor-pointer accent-[#d4a054]"
            />
            <span className="w-7 text-right font-mono text-xs text-[#6b6155]">
              {musicMuted ? "—" : Math.round(musicVol * 100)}
            </span>
          </div>

          {/* SFX */}
          <div className="flex items-center gap-3">
            <button
              onClick={toggleSfxMute}
              title={sfxMuted ? t("menu-unmute-sfx", { defaultValue: "Unmute sound effects" }) : t("menu-mute-sfx", { defaultValue: "Mute sound effects" })}
              className={`flex h-7 w-7 pointer-coarse:h-11 pointer-coarse:w-11 shrink-0 items-center justify-center rounded ${
                sfxMuted ? "text-[#6b6155]" : "text-[#5fd2a0]"
              } hover:bg-white/5`}
            >
              {sfxMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <span className="w-16 font-mono text-[11px] text-[#cabba0]">{t("menu-sfx", { defaultValue: "Sound FX" })}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={sfxMuted ? 0 : sfxVol}
              onChange={handleSfxVol}
              className="h-1 flex-1 cursor-pointer accent-[#5fd2a0]"
            />
            <span className="w-7 text-right font-mono text-xs text-[#6b6155]">
              {sfxMuted ? "—" : Math.round(sfxVol * 100)}
            </span>
          </div>
        </div>

        <NgPlusSlot />

        {/* Controls */}
        <div className="mb-5 grid grid-cols-2 gap-x-4 [@media(pointer:coarse)]:hidden gap-y-1 font-mono text-[11px] text-[#6b6155]">
          <div>{t("menu-ctl-move", { defaultValue: "Move" })} — A/D · ←/→</div>
          <div>{t("menu-ctl-jump", { defaultValue: "Jump" })} — Space / K</div>
          <div>{t("menu-ctl-dash", { defaultValue: "Dash" })} — Shift / J</div>
          <div>{t("menu-ctl-use", { defaultValue: "Interact" })} — E</div>
          <div>{t("menu-ctl-drop", { defaultValue: "Drop down" })} — S / ↓</div>
          <div>{t("menu-ctl-menu", { defaultValue: "Menu" })} — M / Esc</div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-[#d4a054]/30 bg-[#d4a054]/10 py-2 pointer-coarse:min-h-11 font-mono text-sm text-[#f0c674] transition-colors hover:bg-[#d4a054]/20"
          >
            {t("menu-resume", { defaultValue: "Resume" })}<span className="[@media(pointer:coarse)]:hidden"> [M]</span>
          </button>
          <button
            onClick={onMainMenu}
            className="rounded-lg border border-[#d4a054]/30 bg-black/30 px-3 py-2 pointer-coarse:min-h-11 font-mono text-xs text-[#cabba0] transition-colors hover:bg-white/5"
          >
            {t("menu-main-menu", { defaultValue: "Main menu" })}
          </button>
          <button
            onClick={confirmReset}
            className="rounded-lg border border-[#c0392b]/30 bg-[#c0392b]/10 px-3 py-2 pointer-coarse:min-h-11 font-mono text-xs text-[#c0392b]/80 transition-colors hover:bg-[#c0392b]/20"
          >
            {t("menu-abandon", { defaultValue: "Abandon Run" })}
          </button>
        </div>
      </div>
    </div>
  );
}
