/**
 * `toast` — the site's one way to raise a toast, without sonner in the entry.
 *
 * Nothing toasts before an interaction, so the 33 KB library and its
 * `<Toaster>` do not belong on the first-paint path (third-pass audit RT1).
 * This module is the whole of what the entry carries: the first call queues the
 * toast and asks the mounted `<ToastHost>` (components/ui/toast-host.tsx) to
 * load `components/ui/site-toaster.tsx`; when that `<Toaster>` has subscribed
 * it calls {@link bindToaster} and the queue is replayed in order. Every later
 * call goes straight to sonner.
 *
 * A queued toast still needs an id its caller can dismiss or update, so one is
 * minted here and handed to sonner as the toast's own `id`.
 *
 * Import `toast` from here, never from `sonner`: eslint's
 * `no-restricted-imports` keeps sonner to the toaster module.
 */
// eslint-disable-next-line no-restricted-imports -- types only: nothing of sonner is bundled with this module
import type { ExternalToast, toast as sonnerToast } from 'sonner';

type Sonner = typeof sonnerToast;
type ToastId = string | number;
type Message = Parameters<Sonner['success']>[0];
type Kind = 'success' | 'error' | 'info' | 'warning' | 'message';

let sonner: Sonner | undefined;
let wanted = false;
let minted = 0;
const queue: Array<(real: Sonner) => void> = [];
const listeners = new Set<() => void>();

/** Run `call` against sonner: now if it is loaded, otherwise once the toaster is up. */
function run(call: (real: Sonner) => void): void {
  if (sonner) {
    call(sonner);
    return;
  }
  queue.push(call);
  if (wanted) return;
  wanted = true;
  for (const listener of listeners) listener();
}

function withId(data: ExternalToast | undefined): ExternalToast & { id: ToastId } {
  return { ...data, id: data?.id ?? `site-toast-${++minted}` };
}

function raise(kind: Kind | null, message: Message, data?: ExternalToast): ToastId {
  if (sonner) return kind ? sonner[kind](message, data) : sonner(message, data);
  const options = withId(data);
  run((real) => (kind ? real[kind](message, options) : real(message, options)));
  return options.id;
}

export const toast = Object.assign(
  (message: Message, data?: ExternalToast): ToastId => raise(null, message, data),
  {
    success: (message: Message, data?: ExternalToast): ToastId => raise('success', message, data),
    error: (message: Message, data?: ExternalToast): ToastId => raise('error', message, data),
    info: (message: Message, data?: ExternalToast): ToastId => raise('info', message, data),
    warning: (message: Message, data?: ExternalToast): ToastId => raise('warning', message, data),
    message: (message: Message, data?: ExternalToast): ToastId => raise('message', message, data),
    custom: (jsx: Parameters<Sonner['custom']>[0], data?: ExternalToast): ToastId => {
      if (sonner) return sonner.custom(jsx, data);
      const options = withId(data);
      run((real) => real.custom(jsx, options));
      return options.id;
    },
    dismiss: (id?: ToastId): void => run((real) => real.dismiss(id)),
  },
);

/** True once a toast has been raised: the host loads the toaster from then on. */
export function toasterWanted(): boolean {
  return wanted;
}

/** Subscribe to {@link toasterWanted} flipping (it only ever flips once). */
export function subscribeToasterWanted(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Called by the mounted `<Toaster>` once it is listening: replays everything
 * queued so far, in order, and routes later calls directly.
 */
export function bindToaster(real: Sonner): void {
  sonner = real;
  for (const call of queue.splice(0)) call(real);
}
