/**
 * HelperRoot — the container for sanctioned NON-VISIBLE native helpers
 * (purity rule: the canvas is the only visible element; these are zero-size
 * or off-viewport platform shims the browser requires).
 *
 * Currently hosts the shared IME input proxy. File pickers are created on
 * demand (`filePicker.ts`); media pipes mount per-widget.
 */

import { useEffect, useRef } from "react";
import { create } from "zustand";

export interface InputProxyTarget {
  id: string;
  /** Current value + caret, mirrored to the canvas field. */
  value: string;
  multiline: boolean;
  inputMode?: string;
  autocomplete?: string;
  enterKeyHint?: string;
  /** Viewport position of the canvas caret — keeps IME candidate windows
   * and iOS scroll-into-view sane. */
  caret: { x: number; y: number };
  onChange: (value: string, selectionStart: number, selectionEnd: number) => void;
  onSubmit?: () => void;
  onBlur?: () => void;
}

interface InputProxyStore {
  target: InputProxyTarget | null;
  focus: (target: InputProxyTarget) => void;
  update: (id: string, patch: Partial<InputProxyTarget>) => void;
  blur: (id: string) => void;
}

export const useInputProxyStore = create<InputProxyStore>((set, get) => ({
  target: null,
  focus: (target) => set({ target }),
  update: (id, patch) => {
    const t = get().target;
    if (t?.id === id) set({ target: { ...t, ...patch } });
  },
  blur: (id) => {
    if (get().target?.id === id) set({ target: null });
  },
}));

export function HelperRoot() {
  return (
    <div data-canvas-helpers aria-hidden="true">
      <InputProxy />
    </div>
  );
}

/**
 * The single shared hidden <textarea> that receives real keyboard focus for
 * every canvas text field: native IME composition, autocorrect, paste and
 * soft-keyboard behavior for free. Visually 1×1 and transparent, positioned
 * at the canvas caret.
 */
function InputProxy() {
  const target = useInputProxyStore((s) => s.target);
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !target) return;
    el.value = target.value;
    el.focus({ preventScroll: true });
  }, [target?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!target) return null;

  return (
    <textarea
      ref={ref}
      data-canvas-input-proxy
      rows={1}
      inputMode={target.inputMode as never}
      autoComplete={target.autocomplete}
      enterKeyHint={target.enterKeyHint as never}
      style={{
        position: "fixed",
        left: target.caret.x,
        top: target.caret.y,
        width: 1,
        height: 1,
        opacity: 0,
        padding: 0,
        border: "none",
        resize: "none",
        // Keep it technically visible so focus/IME work (never display:none).
        overflow: "hidden",
      }}
      onInput={(e) => {
        const el = e.currentTarget;
        target.onChange(el.value, el.selectionStart ?? el.value.length, el.selectionEnd ?? el.value.length);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !target.multiline && !e.shiftKey) {
          e.preventDefault();
          target.onSubmit?.();
        }
      }}
      onBlur={() => target.onBlur?.()}
    />
  );
}
