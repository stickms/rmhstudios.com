/**
 * CanvasPage — the canonical wrapper a CONVERTED route renders.
 *
 * Lives in the normal react-dom route tree (full router/query/i18n context),
 * and does three things:
 *   1. registers the route's SCENE (drawn by StageHost) with a props
 *      snapshot, so loader/query data flows into the canvas on every render;
 *   2. renders the route's semantic MIRROR — the visually-hidden DOM that
 *      SSRs for crawlers and stays live for screen readers — plus the
 *      registered-control outlet;
 *   3. declares the shell variant ("site" pages get the sidebar shell scene;
 *      "fullscreen" pages own the whole stage).
 *
 * head()/loader/SEO on the route are untouched — CanvasPage replaces only
 * the visual body.
 */

import { useEffect, type ComponentType, type ReactNode } from "react";
import { useSceneRegistry, type ShellVariant } from "../scene/registry";
import { MirrorOutlet } from "../mirror/MirrorControls";
import { StageHost } from "./StageHost";

export interface CanvasPageProps<P extends Record<string, unknown>> {
  /** Unique scene id — use the route path (e.g. "/privacy"). */
  routeId: string;
  scene: ComponentType<P>;
  /** Props snapshot passed to the scene (loader data, callbacks). */
  sceneProps: P;
  /** Semantic DOM mirror: headings/text/links crawlers index and AT reads. */
  mirror: ReactNode;
  shell?: ShellVariant;
  title?: string;
}

export function CanvasPage<P extends Record<string, unknown>>({
  routeId,
  scene,
  sceneProps,
  mirror,
  shell = "site",
  title,
}: CanvasPageProps<P>) {
  const register = useSceneRegistry((s) => s.register);
  const unregister = useSceneRegistry((s) => s.unregister);

  useEffect(() => {
    register({
      id: routeId,
      scene: scene as ComponentType<Record<string, unknown>>,
      props: sceneProps,
      shell,
      title,
    });
  }, [register, routeId, scene, sceneProps, shell, title]);

  useEffect(() => () => unregister(routeId), [unregister, routeId]);

  return (
    <>
      {/* SSR/AT mirror — the only DOM this route contributes. sr-mirror is
          1px-clipped (never display:none) so crawlers and screen readers
          read it while sighted users see the canvas. */}
      <div className="sr-mirror" data-canvas-mirror={routeId}>
        {mirror}
        <MirrorOutlet />
      </div>
    </>
  );
}

export { StageHost };
