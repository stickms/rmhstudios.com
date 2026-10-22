'use client';

import { Suspense, lazy, useEffect, useRef, useSyncExternalStore } from 'react';
import { useRouter } from '@tanstack/react-router';
import { Globe } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { isEversionEnabled } from '@/lib/eversion/flags';
import type { EversionNode } from '@/lib/eversion/types';
import { useThemeStore } from '@/stores/themeStore';
import {
  awaitController,
  eversionRoot,
  getController,
  getHub,
  hasNoEffect,
  setController,
  warmEversion,
  wantBridge,
} from './eversion-root';
import {
  inShell,
  installNavigationEversion,
  type HeldNavigation,
  type NavRouter,
} from './eversion-nav';
import { showPopup } from './popup';
import type { EversionControllerHandle } from './useEversionController';
import './eversion.css';

/**
 * The Globe Eversion at the root of every page (amended 2026-10-21; see `eversion-root.ts` for why it moved out of
 * the hub). Mounted once by `__root.tsx`, it:
 *
 * - warms the runtime after `load` and an idle slot (it used to be the hub's warm-up) and mounts the lazy
 *   `EversionBridge`, which builds the page's one controller;
 * - installs the navigation interceptor (`eversion-nav.ts`), so (at the default eversion level, `all`; at `globe`
 *   it stands aside unless the hub is open) every page transition, wherever it starts and
 *   wherever it goes, plays an eversion: the full-screen run from the open hub's globe if the hub is up, else
 *   the button-sized one on the control that was pressed (`mini-globe.ts`), with the navigation never held;
 *   the pop-up globe (`popup.ts`) remains only for a held navigation that finds no hub to hand over to;
 * - answers the Settings "Preview" button.
 *
 * Its static imports are the flag, the theme store and three small leaves; the runtime hangs off the lazy bridge
 * (`pnpm check:bundle-budget`, S#39).
 */
const EversionBridge = lazy(() => import('./EversionBridge'));

/**
 * The button-sized eversion's renderer, its own lazy chunk (the root's static closure stays small, S#39). Warmed
 * with the runtime, so it is normally in before the first press; a press that beats it still plays if the chunk
 * lands within `MINI_LATE_MS`, else that one navigation plays nothing (it is never held either way).
 */
type MiniModule = typeof import('./mini-globe');
let miniModule: MiniModule | null = null;
let miniLoad: Promise<MiniModule> | null = null;
const loadMini = () =>
  (miniLoad ??= import('./mini-globe').then((m) => (miniModule = m)).catch((err) => {
    miniLoad = null;
    throw err;
  }));
const MINI_LATE_MS = 150;
function playMini(control: Element): void {
  if (miniModule) {
    miniModule.playMiniEversion(control);
    return;
  }
  const asked = performance.now();
  void loadMini()
    .then((m) => {
      if (performance.now() - asked <= MINI_LATE_MS) m.playMiniEversion(control);
    })
    .catch(() => {});
}

/** The Settings "Preview" button's event (AppearancePanel.tsx; spec §9.3). */
const EVERSION_PREVIEW_EVENT = 'rmh:eversion-preview';
/** The hub's open-morph length (RadialHub `MOTION_MS`): the BEFORE capture never lands inside it. */
const HUB_MOTION_MS = 500;

/** A destination for the controller: the effect only needs where it goes. */
function nodeFor(href: string, pathname: string): EversionNode {
  return {
    id: `nav:${pathname}`,
    href,
    tKey: 'feed:eversion.navigate',
    label: pathname,
    icon: Globe,
  };
}

export function EversionRoot() {
  const router = useRouter();
  const { t } = useTranslation('feed');
  const tRef = useRef(t);
  tRef.current = t;
  const root = useSyncExternalStore(
    eversionRoot.subscribe,
    eversionRoot.getSnapshot,
    eversionRoot.getServerSnapshot,
  );

  // The warm-up: idle if it comes, a short timer regardless, whichever lands first; never before `load`
  // (`startEversion`). A device that reports no WebGL2 never mounts the bridge (R6 m5).
  useEffect(() => {
    if (!isEversionEnabled()) return;
    const w = window as typeof window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (h: number) => void;
    };
    let ran = false;
    const warm = () => {
      if (ran) return;
      ran = true;
      void warmEversion();
      void loadMini().catch(() => {});
    };
    const timer = setTimeout(warm, 800);
    const handle = w.requestIdleCallback?.(warm, { timeout: 800 });
    return () => {
      clearTimeout(timer);
      if (handle !== undefined) w.cancelIdleCallback?.(handle);
    };
  }, []);

  // Every page transition plays an eversion: the hub's full-screen run, or the pressed control's mini.
  useEffect(() => {
    if (!isEversionEnabled()) return;
    const navRouter = router as unknown as NavRouter;
    const evert = (held: HeldNavigation) => {
      const fromShell = inShell(navRouter, navRouter.state.location.pathname);
      const toShell = inShell(navRouter, held.pathname);
      const layer = fromShell && toShell ? 'shell' : 'body';
      const node = nodeFor(held.href, held.pathname);
      const hub = getHub();
      if (hub?.isOpen() && fromShell) {
        hub.navigate(node, { go: held.go, traverses: held.traverses, layer });
        return;
      }
      const popup = showPopup(held.origin);
      const run = async () => {
        const controller = getController() ?? (hasNoEffect() ? null : await awaitController());
        if (!controller || !controller.isEligible()) {
          popup.dismiss();
          held.go();
          return;
        }
        const outcome = await controller.start(node, popup.pose(), 'click', {
          navigate: held.go,
          traverses: held.traverses,
          layer: 'body',
          ready: popup.ready,
          onCommit: popup.everting,
          onFirstFrame: popup.swelling,
        });
        if (outcome.fallback === 'traversal') {
          popup.dismiss();
          return;
        }
        if (outcome.fallback) {
          // Nothing was navigated yet: the visitor still goes where they asked.
          popup.dismiss();
          held.go();
          return;
        }
        popup.closed();
      };
      void run().catch(() => {
        popup.dismiss();
        held.go();
      });
    };
    return installNavigationEversion({
      router: navRouter,
      enabled: () =>
        !useThemeStore.getState().reduceMotion &&
        !hasNoEffect() &&
        document.visibilityState === 'visible',
      // Read from the store on each navigation (not captured here): a change in Settings applies to the next one.
      level: () => useThemeStore.getState().eversionLevel,
      hubOpen: () => !!getHub()?.isOpen(),
      busy: () => {
        const phase = getController()?.state().phase;
        return (phase !== undefined && phase !== 'idle' && phase !== 'done') || !!getHub()?.busy();
      },
      evert,
      mini: playMini,
    });
  }, [router]);

  // The Settings "Preview" button.
  useEffect(() => {
    if (!isEversionEnabled()) return;
    let alive = true;
    const unavailable = () =>
      toast.info(
        tRef.current('eversion-preview-unavailable', {
          defaultValue: 'This transition cannot play here, so pages change as usual.',
        }),
      );
    const preview = (controller: EversionControllerHandle) => {
      void controller.preview().then((outcome) => {
        // `busy` is a preview already running; `traversal` cannot happen here.
        if (alive && outcome.fallback && outcome.fallback !== 'busy') unavailable();
      });
    };
    const onPreview = () => {
      const controller = getController();
      if (controller) return preview(controller);
      // The bridge has not loaded yet: ask for it and run the preview the moment it hands the controller up. A
      // device that cannot run the effect says so instead of doing nothing.
      void wantBridge().then((ok) => {
        if (!alive) return;
        if (!ok) return unavailable();
        void awaitController().then((c) => {
          if (alive && c) preview(c);
          else if (alive) unavailable();
        });
      });
    };
    window.addEventListener(EVERSION_PREVIEW_EVENT, onPreview);
    return () => {
      alive = false;
      window.removeEventListener(EVERSION_PREVIEW_EVENT, onPreview);
    };
  }, []);

  if (!root.bridgeWanted) return null;
  return (
    <Suspense fallback={null}>
      <EversionBridge
        open={root.hubOpen}
        motionMs={HUB_MOTION_MS}
        ahead={root.shells > 0}
        onController={setController}
      />
    </Suspense>
  );
}
