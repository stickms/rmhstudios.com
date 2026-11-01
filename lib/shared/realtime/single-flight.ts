/**
 * Share one in-flight async call between concurrent callers.
 *
 * Every game socket client does `if (client) return client.socket`, then
 * `await authClient.getSession()`, and only afterwards assigns `client`. Two
 * callers inside that await window (React StrictMode's dev double-effect, or a
 * landing page handing over to a room page) both saw "no client" and each built
 * a socket: one leaked with every handler bound, and the hub's one-socket-per-
 * user rule kicked one of them with a server-side disconnect that socket.io
 * never retries. Wrapping the connect in `singleFlight` makes the second caller
 * await the first call's promise instead. The slot clears when the call settles,
 * so a later call (after a disconnect, or after a failure) starts fresh.
 */
export function singleFlight<A extends unknown[], T>(
  run: (...args: A) => Promise<T>,
): (...args: A) => Promise<T> {
  let inflight: Promise<T> | null = null;
  return (...args: A) => {
    inflight ??= run(...args).finally(() => {
      inflight = null;
    });
    return inflight;
  };
}
