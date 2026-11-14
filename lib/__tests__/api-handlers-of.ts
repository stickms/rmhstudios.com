/**
 * Reach the handlers of an API endpoint in a test that drives one directly, whichever way
 * the endpoint is written: a route file under `app/routes/api` exports `Route`
 * (`Route.options.server.handlers`), a registered endpoint exports `route`
 * (`route.handlers`, `lib/api/route.server.ts`, third-pass audit AR3). A test written
 * against these keeps working when its endpoint moves from one to the other.
 */
export type TestHandler =
  (a: {
    request: Request;
    params: Record<
      string,
      string
    >;
  }) => Promise<Response>;

/**
 * The handlers of an imported `Route` (a route file) or `route` (a registered endpoint),
 * for a test that drives a handler directly. `H` is the test's own handler type.
 */
export function handlersOf<
  H =
    TestHandler,
>(
  route: unknown,
): Record<
  string,
  H
> {
  const r =
    route as {
      handlers?: Record<
        string,
        H
      >;
      options?: {
        server?: {
          handlers?: Record<
            string,
            H
          >;
        };
      };
    };
  const handlers =
    r.handlers ??
    r
      .options
      ?.server
      ?.handlers;
  if (
    !handlers
  )
    throw new Error(
      'not a Route or a registered route: no handlers',
    );
  return handlers;
}

/** The same for a dynamically imported module, whichever of the two it exports. */
export function handlersOfModule<
  H =
    TestHandler,
>(
  mod: unknown,
): Record<
  string,
  H
> {
  const m =
    mod as {
      Route?: unknown;
      route?: unknown;
    };
  return handlersOf<H>(
    m.route ??
      m.Route,
  );
}
