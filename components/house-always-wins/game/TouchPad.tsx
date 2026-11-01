"use client";

import { useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Input } from "@/lib/house-always-wins/input";

/**
 * One virtual button. Pointer events + capture so each finger drives its own
 * button (hold right while tapping jump), and a cancelled/lost pointer always
 * releases, so the player never keeps running after a finger slides off.
 */
function PadButton({
  code,
  label,
  ariaLabel,
  className = "",
}: {
  code: string;
  label: string;
  ariaLabel: string;
  className?: string;
}) {
  const [down, setDown] = useState(false);
  const start = (e: ReactPointerEvent) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    Input.press(code);
    setDown(true);
  };
  const end = () => {
    Input.release(code);
    setDown(false);
  };
  useEffect(() => () => Input.release(code), [code]);
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onPointerDown={start}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onContextMenu={(e) => e.preventDefault()}
      data-gesture=""
      className={`pointer-events-auto flex h-14 min-w-14 touch-none select-none items-center justify-center rounded-full border font-mono text-xs uppercase tracking-widest ${
        down
          ? "border-[#d4a054] bg-[#d4a054]/30 text-[#f0d9a8]"
          : "border-[#d4a054]/30 bg-black/45 text-[#c8b89a]"
      } ${className}`}
    >
      {label}
    </button>
  );
}

/** On-screen controls for coarse pointers (phones/tablets). Hidden on desktop. */
export function TouchPad({ onMenu, host }: { onMenu: () => void; host: HTMLElement | null }) {
  const { t } = useTranslation("c-house-always-wins");
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.("(pointer: coarse)");
    const update = () => setCoarse(!!mq?.matches || navigator.maxTouchPoints > 0);
    update();
    mq?.addEventListener?.("change", update);
    return () => mq?.removeEventListener?.("change", update);
  }, []);
  if (!coarse || !host) return null;
  return createPortal(
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex select-none items-end justify-between p-3"
      data-jelly-scope="off"
    >
      <div className="flex gap-2">
        <PadButton code="ArrowLeft" label="◀" ariaLabel={t("touch-left", { defaultValue: "Move left" })} />
        <PadButton code="ArrowRight" label="▶" ariaLabel={t("touch-right", { defaultValue: "Move right" })} />
      </div>
      <div className="flex items-end gap-2">
        <PadButton code="KeyE" label={t("touch-use", { defaultValue: "Use" })} ariaLabel={t("touch-use-aria", { defaultValue: "Interact" })} />
        <PadButton code="ShiftLeft" label={t("touch-dash", { defaultValue: "Dash" })} ariaLabel={t("touch-dash-aria", { defaultValue: "Dash" })} />
        <PadButton
          code="Space"
          label={t("touch-jump", { defaultValue: "Jump" })}
          ariaLabel={t("touch-jump-aria", { defaultValue: "Jump" })}
          className="h-16 min-w-16"
        />
      </div>
      <button
        type="button"
        onClick={onMenu}
        aria-label={t("touch-menu-aria", { defaultValue: "Open menu" })}
        className="pointer-events-auto absolute right-3 top-[-3.25rem] flex h-11 min-w-11 items-center justify-center rounded-full border border-[#d4a054]/30 bg-black/45 px-3 font-mono text-xs uppercase tracking-widest text-[#c8b89a]"
      >
        {t("touch-menu", { defaultValue: "Menu" })}
      </button>
    </div>,
    host,
  );
}
