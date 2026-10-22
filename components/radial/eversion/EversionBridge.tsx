'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from '@tanstack/react-router';
import {
  createEversionController,
  type EversionControllerHandle,
  type RouterLike,
} from './useEversionController';
import { overlayStore } from './overlay-store';
import { useBeforeCapture } from './useBeforeCapture';
import { whenQuiet } from '../quiet';

/**
 * The hub's whole connection to the Globe Eversion, in ONE lazily loaded module
 * (spec §8.1, S#39; tasks T32). OWNER: T32.
 *
 * ## Why this is a component and not a hook in the hub
 *
 * `useBeforeCapture` statically imports the capture library, the render host and
 * the prefetcher, and the controller hangs the renderer off those. A hook cannot
 * be imported lazily, so calling `useBeforeCapture` from `RadialHub` would put
 * all of it in the `_site` shell's static closure — the exact cost the bundle
 * gate (`check:bundle-budget`, `lib/eversion/gl/*` fingerprints) exists to
 * refuse. Moving the hook call, the controller and the overlay into a component
 * the hub renders through `React.lazy` keeps the hub's own static imports down to
 * the flag and nothing else.
 *
 * It is mounted by `EversionRoot` (amended 2026-10-21: at the root of every page,
 * no longer inside the hub) once the effect is wanted, renders nothing, and hands
 * the controller UP through `onController` into `eversion-root.ts`, where the hub,
 * the navigation interceptor and the Settings preview reach it. Until it has done
 * so there is no controller, and an action waits for one (bounded).
 *
 * ## What it does while mounted
 *
 * - initialises the render host on the persistent canvas at the first idle slot
 *   after it mounts (the one program compile of the page-load);
 * - runs the BEFORE capture scheduler (`useBeforeCapture`) for as long as the hub
 *   is `open`, and tells the controller when the hub opens and closes so it can
 *   do its idle work (projection draw, LUT bake) off the release path;
 * - owns the controller's lifetime: built in an effect (so StrictMode's
 *   mount/unmount/mount disposes one and builds a fresh one), disposed on
 *   unmount, which also aborts a run in flight.
 */
export interface EversionBridgeProps {
  /** The hub is fully open (`phase === 'open'`): the BEFORE capture's cue. */
  open: boolean;
  /** The hub's open-morph length, so the capture never lands inside it. */
  motionMs: number;
  /**
   * Take the BEFORE capture AHEAD of the next navigation while the page is still (`useBeforeCapture`). Only under
   * the shell: a full-screen game's page is never still in the way that matters, and a capture is a main-thread
   * clone of it every few seconds. Off it, a navigation captures on demand, inside its own budget.
   */
  ahead: boolean;
  /** The controller once built; `null` when the bridge unmounts. */
  onController: (controller: EversionControllerHandle | null) => void;
}

/**
 * How long the page must have been still before the compile may run. On WebKit the
 * render host is in-thread and has no `requestIdleCallback`, so the compile is a
 * main-thread task of a few hundred ms on a phone: started on a plain timer it
 * could land in the middle of a scroll (`../quiet.ts`).
 */
const QUIET_MS = 800;

/**
 * `displayName` is also this module's build fingerprint: `check-bundle-budget`
 * looks for it in the shell's static closure on builds without sourcemaps.
 */
export default function EversionBridge({
  open,
  motionMs,
  ahead,
  onController,
}: EversionBridgeProps) {
  const router = useRouter();
  const beforeCapture = useBeforeCapture({ open, motionMs, ahead });
  const controllerRef = useRef<EversionControllerHandle | null>(null);
  const openRef = useRef(open);
  openRef.current = open;

  // The controller is built once, but the router and the capture binding
  // change identity between renders. It reads them through this ref so it
  // never holds a stale one.
  const live = useRef({ router, beforeCapture });
  live.current = { router, beforeCapture };

  useEffect(() => {
    const controller = createEversionController({
      router: {
        navigate: (o) => live.current.router.navigate(o as never),
        get state() {
          return live.current.router.state as RouterLike['state'];
        },
        subscribe: (event, fn) => live.current.router.subscribe(event as never, fn as never),
      },
      beforeCapture: {
        awaitBefore: (grace) => live.current.beforeCapture.awaitBefore(grace),
        isEligible: () => live.current.beforeCapture.isEligible(),
        ineligibleReason: () => live.current.beforeCapture.ineligibleReason(),
        getCapture: () => live.current.beforeCapture.getCapture(),
      },
    });
    controllerRef.current = controller;
    onController(controller);
    // Initialise the render host on the page's real canvas once the page is QUIET,
    // instead of 700 ms after the hub next opens: that is the program compile, and a
    // release that beat it used to skip the effect. Once per page; the hub's own
    // `onHubOpened` warm is then a no-op. Only for a visitor who can see the effect:
    // reduced motion never compiles anything.
    const cancelWarm = whenQuiet(
      () => {
        if (live.current.beforeCapture.isEligible()) void controller.warmHost();
      },
      {
        quietMs: QUIET_MS,
        // While the hub is open the visitor is turning the globe: its own open
        // path warms the host then, after the open morph.
        busy: () => openRef.current,
      },
    );
    return () => {
      cancelWarm();
      onController(null);
      controller.dispose();
      controllerRef.current = null;
    };
  }, [onController]);

  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller || !open) return;
    controller.onHubOpened();
    return () => controller.onHubClosed();
  }, [open]);

  // With the hub closed and the page still: draw the next run's projection and bake its LUT now (`prepare`), so
  // the hub's opening - on WebKit the thread that also draws the globe - has nothing to do but open. Re-armed at
  // every close: a navigation changes the page, and `random` draws a new projection per run.
  useEffect(() => {
    if (open) return;
    return whenQuiet(
      () => {
        if (live.current.beforeCapture.isEligible()) controllerRef.current?.prepare();
      },
      // Not while a run is on screen (Preview runs without opening the hub).
      { quietMs: QUIET_MS, busy: () => openRef.current || overlayStore.getSnapshot().mounted },
    );
  }, [open]);

  // The run's layers are not drawn here: inside the hub (`EversionOverlay`, which the hub renders, so they share
  // its stacking context under its globe) or at the top of <body> (the controller's DOM port), per run.
  return null;
}

EversionBridge.displayName = 'rmh-eversion-bridge';
