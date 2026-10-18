'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { EversionOverlay } from './EversionOverlay';
import {
  createEversionController,
  type EversionControllerHandle,
  type RouterLike,
} from './useEversionController';
import { useBeforeCapture } from './useBeforeCapture';

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
 * It is mounted only when the effect is wanted (flag on, after the same idle
 * window that warms the runtime), renders nothing but the overlay, and hands the
 * controller UP through `onController` — the hub's `onNavigate` and the Settings
 * preview event call it from outside React. Until it has done so the hub has no
 * controller, which the hub reads as "ineligible": today's navigation, unchanged.
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
  /** The controller once built; `null` when the bridge unmounts. */
  onController: (controller: EversionControllerHandle | null) => void;
}

/**
 * `displayName` is also this module's build fingerprint: `check-bundle-budget`
 * looks for it in the shell's static closure on builds without sourcemaps.
 */
export default function EversionBridge({ open, motionMs, onController }: EversionBridgeProps) {
  const { t } = useTranslation('feed');
  const router = useRouter();
  const beforeCapture = useBeforeCapture({ open, motionMs });
  const controllerRef = useRef<EversionControllerHandle | null>(null);

  // The controller is built once, but the router, the translator and the
  // capture binding change identity between renders. It reads them through
  // this ref so it never holds a stale one.
  const live = useRef({ router, t, beforeCapture });
  live.current = { router, t, beforeCapture };

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
      translate: (key, options) => String(live.current.t(key, options as never)),
    });
    controllerRef.current = controller;
    onController(controller);
    // Initialise the render host on the page's real canvas now, in the first idle
    // slot, instead of 700 ms after the hub next opens: that is the program compile,
    // and a release that beat it used to skip the effect. Once per page; the hub's
    // own `onHubOpened` warm is then a no-op.
    const w = window as typeof window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    // Only for a visitor who can see the effect: reduced motion never compiles anything.
    const warm = () => {
      if (live.current.beforeCapture.isEligible()) void controller.warmHost();
    };
    const idle = w.requestIdleCallback?.(warm, { timeout: 1500 });
    const timer = idle === undefined ? setTimeout(warm, 300) : undefined;
    return () => {
      if (idle !== undefined) w.cancelIdleCallback?.(idle);
      if (timer !== undefined) clearTimeout(timer);
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

  return <EversionOverlay />;
}

EversionBridge.displayName = 'rmh-eversion-bridge';
