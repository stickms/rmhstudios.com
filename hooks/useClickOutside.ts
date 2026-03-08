"use client";

import { useEffect, type RefObject } from "react";

/**
 * Calls `onClickOutside` when a mousedown event occurs outside `ref`.
 * Pass `isActive` to conditionally enable (defaults to true).
 */
export function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  onClickOutside: () => void,
  isActive = true,
) {
  useEffect(() => {
    if (!isActive) return;

    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClickOutside();
      }
    }

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ref, onClickOutside, isActive]);
}
