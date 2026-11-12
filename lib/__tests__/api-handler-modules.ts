/**
 * Load the handlers of one API source file in a test, wherever it lives: a route file
 * under `app/routes/api` (`Route.options.server.handlers`) or a registered module
 * (`route.handlers`, third-pass audit AR3). Tests that walk every endpoint
 * (`api-cache-policy`, `api-dead-session`) key on the repo-relative file the triage
 * script reports, so they do not care which of the two an endpoint is.
 */
import { handlersOfModule, type TestHandler } from './api-handlers-of';

type HandlerModule = Record<string, unknown>;

const globbed = {
  ...import.meta.glob<HandlerModule>('../../app/routes/api/**/*.ts'),
  ...import.meta.glob<HandlerModule>('../**/api/*.server.ts'),
  ...import.meta.glob<HandlerModule>('../api/routes/*.server.ts'),
  ...import.meta.glob<HandlerModule>('../../features/**/api/*.server.ts'),
};

/** Glob keys are relative to this file (`lib/__tests__/`); index them by repo-relative path. */
const loaders = new Map(
  Object.entries(globbed).map(([key, load]) => [
    key.startsWith('../../') ? key.slice('../../'.length) : `lib/${key.slice('../'.length)}`,
    load,
  ]),
);

/** The handlers `file` (repo-relative) declares, by method; throws if no glob covers it. */
export async function loadApiHandlers(file: string): Promise<Record<string, TestHandler>> {
  const load = loaders.get(file);
  if (!load) throw new Error(`no import.meta.glob in api-handler-modules.ts covers ${file}`);
  return handlersOfModule(await load());
}
