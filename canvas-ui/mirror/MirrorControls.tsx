/**
 * Registered control mirror — real, focusable DOM controls for canvas widgets.
 *
 * Every interactive canvas widget registers itself here; `MirrorOutlet`
 * (rendered inside the sr-mirror) emits a real `<button>`/`<a>` per control.
 * Screen readers and keyboard users interact with the mirror element; its
 * activation invokes the same handler as the canvas node, and its focus is
 * reflected back as a drawn focus ring (`focusManager`).
 *
 * Widgets register AUTOMATICALLY — opting out (`mirror={false}`) is the
 * explicit act, so the a11y tree can only drift where someone chose to.
 */

import { create } from "zustand";
import { useEffect, useId } from "react";

export interface MirrorControl {
  id: string;
  role: "button" | "link";
  label: string;
  href?: string;
  disabled?: boolean;
  onActivate?: () => void;
  /** Ordering hint — scene order (registration order is a good default). */
  order: number;
}

interface MirrorStore {
  controls: Map<string, MirrorControl>;
  focusedId: string | null;
  register: (control: MirrorControl) => void;
  unregister: (id: string) => void;
  setFocused: (id: string | null) => void;
}

let orderCounter = 0;

export const useMirrorStore = create<MirrorStore>((set) => ({
  controls: new Map(),
  focusedId: null,
  register: (control) =>
    set((s) => {
      const controls = new Map(s.controls);
      controls.set(control.id, control);
      return { controls };
    }),
  unregister: (id) =>
    set((s) => {
      const controls = new Map(s.controls);
      controls.delete(id);
      return { controls };
    }),
  setFocused: (focusedId) => set({ focusedId }),
}));

/** Register an interactive canvas widget in the accessibility mirror. */
export function useMirrorControl(
  control: Omit<MirrorControl, "id" | "order"> | false
): { focused: boolean } {
  const id = useId();
  const register = useMirrorStore((s) => s.register);
  const unregister = useMirrorStore((s) => s.unregister);
  const focused = useMirrorStore((s) => s.focusedId === id);

  const enabled = control !== false;
  const label = enabled ? control.label : "";
  const role = enabled ? control.role : "button";
  const href = enabled ? control.href : undefined;
  const disabled = enabled ? control.disabled : undefined;
  const onActivate = enabled ? control.onActivate : undefined;

  useEffect(() => {
    if (!enabled) return;
    register({ id, role, label, href, disabled, onActivate, order: orderCounter++ });
    return () => unregister(id);
  }, [enabled, id, role, label, href, disabled, onActivate, register, unregister]);

  return { focused };
}

/** DOM outlet for registered controls — render inside the sr-mirror. */
export function MirrorOutlet() {
  const controls = useMirrorStore((s) => s.controls);
  const setFocused = useMirrorStore((s) => s.setFocused);
  const sorted = [...controls.values()].sort((a, b) => a.order - b.order);
  return (
    <div data-mirror-controls>
      {sorted.map((c) =>
        c.role === "link" && c.href ? (
          <a
            key={c.id}
            href={c.href}
            onClick={(e) => {
              if (c.onActivate) {
                e.preventDefault();
                c.onActivate();
              }
            }}
            onFocus={() => setFocused(c.id)}
            onBlur={() => setFocused(null)}
          >
            {c.label}
          </a>
        ) : (
          <button
            key={c.id}
            type="button"
            disabled={c.disabled}
            onClick={() => c.onActivate?.()}
            onFocus={() => setFocused(c.id)}
            onBlur={() => setFocused(null)}
          >
            {c.label}
          </button>
        )
      )}
    </div>
  );
}
