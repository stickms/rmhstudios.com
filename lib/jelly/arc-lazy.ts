/**
 * The click arc, installed on demand (CSS-first jelly §4, "Arcs are events").
 *
 * The site's material is static CSS plus effects that wake on an event. The electric arc is the one that needs a
 * canvas, so nothing about it exists at rest: {@link installLazyClickArcs} adds ONE `pointerdown` subscription to the
 * shared pointer hub (`pointer.ts`, no listener of its own) and nothing else. No timer, frame, observer or canvas, and
 * the arcs chunk is not even fetched, until the first press.
 *
 * ## The first press
 *
 * A press that passes the gates (below) dynamically imports `@/lib/jelly/arcs` and `installElectricArcs`es it with
 * `ambient: false` — the click-only runtime: no warm-up, no scheduler, no breakdown strikes, no attraction; a click
 * still arcs, deposits its charge and hops it on. The runtime installs its own reference-counted registry when the
 * shared one is absent and releases it on teardown, so there is nothing to manage here. The press that woke it is
 * replayed through `runtime.press(event)` once the registry has had its first intersection report (at most
 * {@link POPULATE_WAIT_MS}; before that the runtime sees no neighbours and the bolt would degrade to a rim fizz). From
 * then on the runtime's own `pointerdown` subscription fires every press, and this module only re-arms the idle timer.
 *
 * ## Idle teardown
 *
 * ONE `setTimeout`, re-armed per click (never an interval): {@link IDLE_MS} after the last click the runtime is
 * disposed — canvas, registry, observers and listeners gone — and the next press starts again. Turning `electricArcs`
 * off (or any other gate going to `off`) while it is installed tears it down at once.
 *
 * ## Gates, at press time and before anything loads
 *
 * `jellyMode().arcs === 'off'` (print, hidden tab, game in play, `jellyMotion = still`, the app tier's
 * high contrast, `electricArcs = off`), a zero click-bolt budget, `html.native-material` routes, a press inside a
 * play-field or other opt-out scope (`OPT_OUT_SCOPE_SELECTOR`), and the radial hub or an eversion. Everything about the
 * target (fields, overlays, toasts, opted-out hosts) and the flash ledger (≤ 3 onsets/s, WCAG 2.3.1) is the runtime's.
 * `electricArcs = clicks` and `full` are the same thing now: ambient arcs no longer exist.
 *
 * {@link ensureClickArcs} installs the runtime on demand for callers that arc without a press (the `/jelly` lab's
 * button), under the same idle teardown.
 */

import type { ElectricArcsOptions, ElectricArcsRuntime } from './arcs';
import { onJellyPointer } from './pointer';
import type * as RegistryModule from './registry';
import {
  HUB_OR_EVERSION_SELECTOR,
  OPT_OUT_SCOPE_SELECTOR,
  jellyBudget,
  jellyMode,
  onJellyEnvChange,
} from './tiers';

/** Teardown after this long without a click. */
export const IDLE_MS = 10_000;
/** The longest the replayed first press waits for the registry's first intersection report. */
export const POPULATE_WAIT_MS = 150;

/** May a click arc fire for this press? Synchronous and cheap: it decides whether anything is loaded at all. */
function pressAllowed(doc: Document, e: PointerEvent): boolean {
  if (e.isPrimary === false) return false;
  if (e.pointerType !== 'touch' && e.button !== 0) return false;
  if (!arcsAllowed(doc)) return false;
  const target = e.target as Element | null;
  if (!target || typeof target.closest !== 'function') return false;
  // A play-field (and any other opted-out scope) never arcs.
  return target.closest(OPT_OUT_SCOPE_SELECTOR) === null;
}

/** The document-level gates: nothing about a particular press. */
function arcsAllowed(doc: Document): boolean {
  if (doc.documentElement.matches('.native-material')) return false;
  if (jellyMode({ doc }).arcs === 'off') return false;
  if (jellyBudget({ doc }).clickBolts <= 0) return false;
  return !doc.querySelector(HUB_OR_EVERSION_SELECTOR);
}

interface Controller {
  onDown(e: PointerEvent): void;
  ensure(): Promise<ElectricArcsRuntime | null>;
  stop(): void;
}

const controllers = new WeakMap<Document, Controller>();

function createController(doc: Document, runtimeOptions: ElectricArcsOptions): Controller {
  let runtime: ElectricArcsRuntime | null = null;
  let teardown: (() => void) | null = null;
  let offEnv: (() => void) | null = null;
  let idle: ReturnType<typeof setTimeout> | undefined;
  let loading: Promise<ElectricArcsRuntime | null> | null = null;
  let registryModule: typeof RegistryModule | null = null;
  let cancelWait: (() => void) | null = null;
  /** Bumped by `stop`, so an import still in flight when it runs installs nothing. */
  let generation = 0;

  const stop = () => {
    generation++;
    if (idle !== undefined) clearTimeout(idle);
    idle = undefined;
    cancelWait?.();
    offEnv?.();
    offEnv = null;
    loading = null;
    runtime = null;
    const t = teardown;
    teardown = null;
    t?.();
  };

  const arm = () => {
    if (idle !== undefined) clearTimeout(idle);
    idle = setTimeout(stop, IDLE_MS);
  };

  const ensure = (): Promise<ElectricArcsRuntime | null> => {
    if (runtime) {
      arm();
      return Promise.resolve(runtime);
    }
    if (loading) return loading;
    const mine = generation;
    const pending: Promise<ElectricArcsRuntime | null> = Promise.all([
      import('./arcs'),
      import('./registry'),
    ])
      .then(([arcs, registry]) => {
        if (mine !== generation) return null;
        registryModule = registry;
        teardown = arcs.installElectricArcs(doc, { ...runtimeOptions, ambient: false });
        runtime = arcs.activeElectricArcs();
        if (!runtime) {
          teardown = null;
          return null;
        }
        // Any gate going to `off` (the preference, still, a game starting, print) ends the session now.
        offEnv = onJellyEnvChange(() => {
          if (jellyMode({ doc }).arcs === 'off') stop();
        }, doc);
        arm();
        return runtime;
      })
      .catch(() => null)
      .finally(() => {
        if (loading === pending) loading = null;
      });
    loading = pending;
    return pending;
  };

  /** Resolves once the registry knows its first visible hosts (or after {@link POPULATE_WAIT_MS}). */
  const populated = (): Promise<void> =>
    new Promise((resolve) => {
      const registry = registryModule?.jellyRegistry(doc);
      if (!registry || registry.visible().length > 0) return resolve();
      let done = false;
      let off = () => {};
      function finish() {
        if (done) return;
        done = true;
        off();
        clearTimeout(timer);
        if (cancelWait === finish) cancelWait = null;
        resolve();
      }
      off = registry.onChange(() => {
        if (registry.visible().length > 0) finish();
      });
      const timer = setTimeout(finish, POPULATE_WAIT_MS);
      cancelWait = finish;
    });

  const wake = async (e: PointerEvent) => {
    const mine = generation;
    const rt = await ensure();
    if (!rt) return;
    await populated();
    if (mine !== generation || runtime !== rt) return;
    rt.press(e);
  };

  return {
    onDown(e) {
      if (!pressAllowed(doc, e)) return;
      // Installed: the runtime's own subscription fires this press; the installer only keeps it alive.
      if (runtime) return arm();
      if (loading) return;
      void wake(e);
    },
    ensure,
    stop,
  };
}

const controllerFor = (doc: Document, runtimeOptions: ElectricArcsOptions = {}): Controller => {
  let c = controllers.get(doc);
  if (!c) controllers.set(doc, (c = createController(doc, runtimeOptions)));
  return c;
};

/**
 * Subscribe the lazy click arc to `doc`'s pointer hub. Returns the disposer: it removes the subscription, the idle
 * timer and the runtime. `runtimeOptions` is a test seam (a fake registry, ledger and bus).
 */
export function installLazyClickArcs(
  doc: Document = document,
  runtimeOptions?: ElectricArcsOptions,
): () => void {
  const win = doc?.defaultView;
  if (!win || !doc.body) return () => {};
  const controller = controllerFor(doc, runtimeOptions);
  const off = onJellyPointer('pointerdown', controller.onDown, win);
  return () => {
    off();
    controller.stop();
    if (controllers.get(doc) === controller) controllers.delete(doc);
  };
}

/**
 * Make sure the click-only runtime is installed (and its idle teardown armed), for a caller that arcs without a
 * press: the `/jelly` lab's button awaits this before `strike(a, b)`. Does nothing while arcs are off; the runtime's
 * own gates still apply to what is struck.
 */
export async function ensureClickArcs(
  doc: Document | undefined = typeof document === 'undefined' ? undefined : document,
): Promise<void> {
  if (!doc?.defaultView || !doc.body) return;
  if (!arcsAllowed(doc)) return;
  await controllerFor(doc).ensure();
}
