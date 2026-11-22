/**
 * Single-flight: concurrent callers asking for the same key share one in-flight promise, so a
 * burst of identical lookups costs one outbound call. The entry is dropped as soon as the call
 * settles (it caches nothing); pair it with a TTL cache for the result.
 *
 * A factory rather than a module-level map so each user owns (and can reset) its own flights.
 * Client-safe and dependency-free: the socket hub imports it relatively.
 */
export function createSingleFlight<T>(): (key: string, run: () => Promise<T>) => Promise<T> {
  const flights = new Map<string, Promise<T>>();
  return (key, run) => {
    const existing = flights.get(key);
    if (existing) return existing;
    const flight = run().finally(() => {
      if (flights.get(key) === flight) flights.delete(key);
    });
    flights.set(key, flight);
    return flight;
  };
}
