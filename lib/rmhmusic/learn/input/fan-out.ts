/**
 * One value to many listeners, for the microphone's level and analysis frames (about 40 a second
 * while it runs). With no listener an emit is a size check and nothing else; the set is iterated
 * in place (no copy per frame: a listener removed during an emit is skipped, as `Set` iteration
 * does). A listener that throws is a bug in that listener: it must not stop the others or the
 * microphone's poll, so it is caught here. Pure and client-safe.
 */
export interface FanOut<
  T,
> {
  /** Listen; returns the function that stops listening. */
  add(
    listener: (
      value: T,
    ) => void,
  ): () => void;
  emit(
    value: T,
  ): void;
  size(): number;
}

export function createFanOut<
  T,
>(): FanOut<T> {
  const listeners =
    new Set<
      (
        value: T,
      ) => void
    >();
  return {
    add(
      listener,
    ) {
      listeners.add(
        listener,
      );
      return () => {
        listeners.delete(
          listener,
        );
      };
    },
    emit(
      value,
    ) {
      if (
        listeners.size ===
        0
      )
        return;
      for (const l of listeners) {
        try {
          l(
            value,
          );
        } catch {
          // A listener's own bug; the rest still hear the value.
        }
      }
    },
    size: () =>
      listeners.size,
  };
}
