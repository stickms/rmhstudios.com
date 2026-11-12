/**
 * Load the handlers of one API source file in a test, wherever it lives: a route file
 * under `app/routes/api` (`Route.options.server.handlers`) or a registered module
 * (`route.handlers`, third-pass audit AR3). Tests that walk every endpoint
 * (`api-cache-policy`, `api-dead-session`) key on the repo-relative file the triage
 * script reports, so they do not care which of the two an endpoint is.
 */
import type { ApiRouteHandlers } from '@/lib/api/route.server';

export type TestHandler = (a: {
  request: Request;
  params: Record<string, string>;
}) => Promise<Response>;

interface HandlerModule {
  Route?: { options?: { server?: { handlers?: Record<string, unknown> } } };
  route?: { handlers?: ApiRouteHandlers };
}

const loaders = {
  ...import.meta.glob<HandlerModule>('../../app/routes/api/**/*.ts'),
  ...import.meta.glob<HandlerModule>('../../lib/**/api/*.server.ts'),
  ...import.meta.glob<HandlerModule>('../../lib/api/routes/*.server.ts'),
  ...import.meta.glob<HandlerModule>('../../features/**/api/*.server.ts'),
};

/** The handlers `file` (repo-relative) declares, by method; throws if no glob covers it. */
export async function loadApiHandlers(file: string): Promise<Record<string, TestHandler>> {
  const load = loaders[`../../${file}`];
  if (!load) throw new Error(`no import.meta.glob in api-handler-modules.ts covers ${file}`);
  const mod = await load();
  const handlers = mod.route?.handlers ?? mod.Route?.options?.server?.handlers;
  return (handlers ?? {}) as Record<string, TestHandler>;
}
