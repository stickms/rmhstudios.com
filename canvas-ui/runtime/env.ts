/**
 * Canvas environment context — the minimal bridge from the DOM app into the
 * konva reconciler subtree (navigation; extend deliberately, not by default:
 * data should flow through scene props, state through zustand).
 */

import { createContext, useContext } from "react";
import type { RouterHistory } from "@tanstack/react-router";

export interface CanvasEnv {
  navigate: (to: string) => void;
  history: RouterHistory;
}

export const CanvasEnvContext = createContext<CanvasEnv | null>(null);

export function useCanvasEnv(): CanvasEnv {
  const env = useContext(CanvasEnvContext);
  if (!env) throw new Error("canvas-ui: useCanvasEnv called outside a scene.");
  return env;
}
