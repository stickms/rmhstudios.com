/**
 * The one frame loop for every person in the scene. Figures register with the registry in context; this component
 * calls `registry.frame` once per rendered frame, which updates every animator that is due (nearest get a full-rate
 * mixer, further ones a slow one, off-screen ones none) and promotes or demotes figures between model and procedural.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import {
  useFrame,
  useThree,
} from '@react-three/fiber';
import { runtime } from '@features/hearthworks/engine/runtime-instance';
import { FigureRegistry } from '@features/hearthworks/engine/skins/figure-registry';
import { releaseUnusedModels } from '@features/hearthworks/engine/skins/model-loader';

const FigureContext =
  createContext<FigureRegistry | null>(
    null,
  );

/** The registry of the surrounding `FigureSystem`, or null (a lone preview that animates itself). */
export const useFigureRegistry =
  (): FigureRegistry | null =>
    useContext(
      FigureContext,
    );

export function FigureSystem({
  children,
}: {
  children: ReactNode;
}) {
  const registry =
    useMemo(
      () =>
        new FigureRegistry(),
      [],
    );
  const gl =
    useThree(
      (
        s,
      ) =>
        s.gl,
    );

  // A lost GL context (or a browser squeezing memory) turns every model back into the procedural figure.
  useEffect(() => {
    const el =
      gl.domElement;
    const lost =
      (
        e: Event,
      ) => {
        e.preventDefault();
        registry.setDisabled(
          true,
        );
        releaseUnusedModels();
      };
    const restored =
      () =>
        registry.setDisabled(
          false,
        );
    el.addEventListener(
      'webglcontextlost',
      lost,
    );
    el.addEventListener(
      'webglcontextrestored',
      restored,
    );
    return () => {
      el.removeEventListener(
        'webglcontextlost',
        lost,
      );
      el.removeEventListener(
        'webglcontextrestored',
        restored,
      );
    };
  }, [
    gl,
    registry,
  ]);

  useFrame(
    (
      state,
      delta,
    ) => {
      // Where the eye is: the avatar in third person, the board's centre in the isometric view.
      const focus =
        runtime.progress >
        0.5
          ? runtime.avatar
          : runtime.isoCenter;
      registry.frame(
        Math.min(
          delta,
          0.1,
        ),
        focus,
        state.camera,
      );
    },
  );

  return (
    <FigureContext.Provider
      value={
        registry
      }
    >
      {
        children
      }
    </FigureContext.Provider>
  );
}
