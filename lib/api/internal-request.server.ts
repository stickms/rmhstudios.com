/**
 * Marks a Request as an in-process read made by a route loader for the page it is
 * rendering (lib/api/internal-dispatch.server.ts).
 *
 * A WeakSet of the Request objects themselves, not a header: nothing a client sends can
 * put its request in here. `defineHandler` reads it for exactly one thing, the rate
 * limiter, because a page view is already admitted (and limited) as a document request,
 * and counting its loader reads again would charge the visitor twice for one page.
 * Session, admin and feature checks and input validation run exactly as for an HTTP call.
 */
const internalRequests = new WeakSet<Request>();

export function markInternalRequest(request: Request): Request {
  internalRequests.add(request);
  return request;
}

export function isInternalRequest(request: Request): boolean {
  return internalRequests.has(request);
}
