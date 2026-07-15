/**
 * StageHost — the single visible element of a converted page.
 *
 * Mounted once from `__root.tsx`. While a scene is registered (i.e. the
 * current route is canvas-converted) it renders the full-viewport Konva
 * `<Stage>`; on unconverted routes it renders nothing, so legacy DOM pages
 * keep working during the conversion waves. Client-only: on the server the
 * route's SSR output is head + the sr-mirror.
 *
 * Sets `window.__canvasReady = true` after yoga is loaded and the first
 * layout pass has flushed — the hook the Playwright census waits on.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Stage, Layer } from "react-konva";
import type Konva from "konva";
import { I18nextProvider, useTranslation } from "react-i18next";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { useSceneRegistry } from "../scene/registry";
import { ensureYoga } from "./layout/yoga";
import {
  Box,
  LayoutScheduler,
  LayoutSchedulerContext,
  type BoxRef,
} from "./layout/LayoutTree";
import { tw } from "./tw";
import { useTheme } from "../theme/useTheme";
import { watchFonts } from "../text/fonts";
import { CanvasEnvContext, type CanvasEnv } from "./env";
import { HelperRoot } from "../helpers/HelperRoot";
import { OverlayRoot } from "../overlay/OverlayManager";
import { ShellScene, type ShellSession } from "@/components/shell/ShellScene";
import { useSession } from "@/components/Providers";

declare global {
  interface Window {
    __canvasReady?: boolean;
  }
}

function useViewportSize() {
  const [size, setSize] = useState(() =>
    typeof window === "undefined"
      ? { width: 0, height: 0 }
      : { width: window.innerWidth, height: window.innerHeight }
  );
  useEffect(() => {
    const update = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", update);
    // Soft-keyboard / pinch: track the visual viewport where available.
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, []);
  return size;
}

export function StageHost() {
  const active = useSceneRegistry((s) => s.active);
  const [yogaReady, setYogaReady] = useState(false);

  useEffect(() => {
    if (!active || yogaReady) return;
    let cancelled = false;
    ensureYoga().then(() => {
      if (!cancelled) setYogaReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [active, yogaReady]);

  useEffect(() => {
    if (!active) {
      window.__canvasReady = false;
    }
  }, [active]);

  if (!active || !yogaReady) return null;
  return <StageHostInner key="stage" />;
}

function StageHostInner() {
  const active = useSceneRegistry((s) => s.active);
  const tokens = useTheme();
  const { width, height } = useViewportSize();
  const router = useRouter();
  const { i18n } = useTranslation();
  const pathname = useRouterState({ select: (st) => st.location.pathname });
  const { data: session } = useSession();
  const su = session?.user as { id?: string; name?: string | null; handle?: string | null; isAdmin?: boolean } | undefined;
  const shellSession: ShellSession = {
    authed: !!session,
    isAdmin: !!su?.isAdmin,
    name: su?.name ?? null,
    handle: su?.handle ?? null,
    userId: su?.id ?? null,
  };
  const layerRef = useRef<Konva.Layer | null>(null);
  const rootBoxRef = useRef<BoxRef | null>(null);

  const scheduler = useMemo(() => new LayoutScheduler(), []);

  useEffect(() => {
    scheduler.setLayer(layerRef.current);
    const unwatch = watchFonts(scheduler);
    return unwatch;
  }, [scheduler]);

  useEffect(() => {
    scheduler.setViewport(width, height);
  }, [scheduler, width, height]);

  // First-draw readiness flag for tests and RUM.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      scheduler.flush();
      window.__canvasReady = true;
    });
    return () => cancelAnimationFrame(raf);
  }, [scheduler, active?.id]);

  const env: CanvasEnv = useMemo(
    () => ({
      navigate: (to) => router.navigate({ to }),
      history: router.history,
    }),
    [router]
  );

  if (!active || width === 0) return null;

  const Scene = active.scene;
  const sceneTree =
    active.shell === "site" ? (
      <ShellScene session={shellSession} pathname={pathname}>
        <Scene {...active.props} />
      </ShellScene>
    ) : (
      <Scene {...active.props} />
    );

  return (
    <>
      <div
        data-canvas-stage-container
        style={{ position: "fixed", inset: 0, background: tokens.bg, zIndex: 40 }}
      >
        <Stage width={width} height={height} id="konva-stage">
          <BridgedProviders i18n={i18n} env={env} scheduler={scheduler}>
            <Layer ref={layerRef}>
              <Box
                ref={(r) => {
                  rootBoxRef.current = r;
                  if (r?.handle) scheduler.root = r.handle;
                }}
                name="scene-root"
                style={tw("flex flex-col w-full h-full")}
              >
                {sceneTree}
              </Box>
            </Layer>
          </BridgedProviders>
        </Stage>
      </div>
      <OverlayRoot />
      <HelperRoot />
    </>
  );
}

/**
 * react-konva starts a second React root, so DOM-tree contexts don't cross
 * into the stage. Re-provide the ones scenes rely on: i18n (useTranslation)
 * and the canvas env (navigation). Theme + registry are zustand singletons
 * and need no bridging. Loader/query data arrives via scene props.
 */
function BridgedProviders({
  children,
  i18n,
  env,
  scheduler,
}: {
  children: ReactNode;
  i18n: Parameters<typeof I18nextProvider>[0]["i18n"];
  env: CanvasEnv;
  scheduler: LayoutScheduler;
}) {
  return (
    <I18nextProvider i18n={i18n}>
      <CanvasEnvContext.Provider value={env}>
        <LayoutSchedulerContext.Provider value={scheduler}>{children}</LayoutSchedulerContext.Provider>
      </CanvasEnvContext.Provider>
    </I18nextProvider>
  );
}
