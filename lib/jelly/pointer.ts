/**
 * The jelly pointer hub: ONE set of window pointer listeners fanned out to every jelly service (CLAUDE.md "Design
 * system: Plasmatic Jelly" → Performance; #989 "one window pointer listener").
 *
 * The soft body, the arcs' click discharge, the engine's cursor light and the fallback light subscribe here instead of
 * each adding their own document listeners. Listeners are capture-phase and passive, installed on the first
 * subscriber and removed with the last. Handlers must not read layout (rects are cached by the registry and refreshed
 * on scroll/resize/activation) and must not call `preventDefault`.
 */

export type JellyPointerType =
  'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel' | 'pointerover' | 'pointerout';

export type JellyPointerHandler = (e: PointerEvent) => void;

const TYPES: readonly JellyPointerType[] = [
  'pointerdown',
  'pointermove',
  'pointerup',
  'pointercancel',
  'pointerover',
  'pointerout',
];

interface Hub {
  handlers: Map<JellyPointerType, Set<JellyPointerHandler>>;
  listener: (e: Event) => void;
  count: number;
}

const hubs = new WeakMap<EventTarget, Hub>();
const OPTS: AddEventListenerOptions = { capture: true, passive: true };

/**
 * Subscribe to a pointer event type on `target`'s hub (default: the window). Returns the unsubscribe.
 * SSR-safe: without a target it returns a no-op.
 */
export function onJellyPointer(
  type: JellyPointerType,
  handler: JellyPointerHandler,
  target: EventTarget | undefined = typeof window === 'undefined' ? undefined : window,
): () => void {
  if (!target) return () => {};
  let hub = hubs.get(target);
  if (!hub) {
    const handlers = new Map<JellyPointerType, Set<JellyPointerHandler>>();
    const listener = (e: Event) => {
      const set = handlers.get(e.type as JellyPointerType);
      if (!set) return;
      for (const fn of [...set]) {
        try {
          fn(e as PointerEvent);
        } catch (error) {
          queueMicrotask(() => {
            throw error;
          });
        }
      }
    };
    hub = { handlers, listener, count: 0 };
    hubs.set(target, hub);
    for (const t of TYPES) target.addEventListener(t, listener, OPTS);
  }
  let set = hub.handlers.get(type);
  if (!set) hub.handlers.set(type, (set = new Set()));
  if (set.has(handler)) return () => {};
  set.add(handler);
  hub.count++;
  const h = hub;
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    set.delete(handler);
    h.count--;
    if (h.count === 0) {
      for (const t of TYPES) target.removeEventListener(t, h.listener, OPTS);
      hubs.delete(target);
    }
  };
}
