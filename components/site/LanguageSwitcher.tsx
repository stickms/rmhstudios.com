'use client';

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Globe, Check, ChevronDown } from "lucide-react";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n/config";
import { useLocaleStore } from "@/stores/localeStore";
import { cn } from "@/lib/utils";

type MenuRect = { left: number; top: number; width: number; maxHeight: number; openUp: boolean };

const MENU_MIN_WIDTH = 200;
const MENU_MAX_HEIGHT = 288;
const GAP = 6;
const VIEWPORT_PAD = 8;

/** Styled language picker: a pill trigger that opens a portalled, scrollable menu. */
export function LanguageSwitcher() {
  const { t } = useTranslation("nav");
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);

  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<MenuRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const label = t("language", { defaultValue: "Language" });

  const measure = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Trigger fully scrolled out of view — close rather than float the menu.
    if (r.bottom <= 0 || r.top >= window.innerHeight) {
      setOpen(false);
      return;
    }
    const width = Math.max(r.width, MENU_MIN_WIDTH);
    const spaceBelow = window.innerHeight - r.bottom - VIEWPORT_PAD;
    const spaceAbove = r.top - VIEWPORT_PAD;
    const openUp = spaceBelow < Math.min(MENU_MAX_HEIGHT, 160) && spaceAbove > spaceBelow;
    const maxHeight = Math.min(MENU_MAX_HEIGHT, openUp ? spaceAbove : spaceBelow);
    // Right-align the menu to the trigger, clamped to stay on-screen.
    const left = Math.min(
      Math.max(r.right - width, VIEWPORT_PAD),
      window.innerWidth - width - VIEWPORT_PAD,
    );
    const top = openUp ? r.top - GAP : r.bottom + GAP;
    setRect({ left, top, width, maxHeight, openUp });
  }, []);

  useEffect(() => {
    if (open) measure();
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    let raf = 0;
    // Keep the menu glued to the trigger while any ancestor scrolls or the
    // viewport resizes (capture phase catches nested scrollers like the mobile
    // sidebar drawer). rAF-throttled so rapid scroll coalesces to one measure
    // per frame. measure() itself closes the menu if the trigger leaves view.
    const reposition = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open, measure]);

  // Focus the active option when the menu opens, for keyboard users.
  useEffect(() => {
    if (open && rect) {
      menuRef.current
        ?.querySelector<HTMLButtonElement>('[data-active="true"]')
        ?.focus();
    }
  }, [open, rect]);

  const choose = (l: Locale) => {
    setLocale(l);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onMenuKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [],
    );
    if (items.length === 0) return;
    const idx = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === "ArrowDown"
      ? items[(idx + 1 + items.length) % items.length]
      : items[(idx - 1 + items.length) % items.length];
    next?.focus();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={label}
        title={label}
        className={cn(
          "inline-flex items-center gap-2 rounded-lg border border-site-border bg-site-surface px-2.5 py-1.5",
          "text-sm text-site-text-muted transition-colors hover:bg-site-surface-hover hover:text-site-text",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-site-accent focus-visible:ring-offset-1 focus-visible:ring-offset-site-bg",
          open && "bg-site-surface-hover text-site-text",
        )}
      >
        <Globe className="h-4 w-4 shrink-0" aria-hidden />
        <span className="min-w-0 truncate">{LOCALE_LABELS[locale]}</span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-site-text-dim transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open && rect && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            id={listboxId}
            role="listbox"
            aria-label={label}
            onKeyDown={onMenuKey}
            style={{
              position: "fixed",
              left: rect.left,
              [rect.openUp ? "bottom" : "top"]: rect.openUp
                ? window.innerHeight - rect.top
                : rect.top,
              width: rect.width,
              maxHeight: rect.maxHeight,
            }}
            className="z-[100] overflow-y-auto overscroll-contain rounded-xl border border-site-border bg-site-surface p-1 shadow-[var(--site-shadow)]"
          >
            {LOCALES.map((l) => {
              const active = l === locale;
              return (
                <button
                  key={l}
                  type="button"
                  role="option"
                  aria-selected={active}
                  data-active={active}
                  onClick={() => choose(l)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                    "focus:outline-none focus-visible:bg-site-surface-hover",
                    active
                      ? "bg-site-accent-dim text-site-text"
                      : "text-site-text-muted hover:bg-site-surface-hover hover:text-site-text",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{LOCALE_LABELS[l]}</span>
                  {active && <Check className="h-4 w-4 shrink-0 text-site-accent" aria-hidden />}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
