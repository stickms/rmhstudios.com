import { createRuntime } from './runtime';

/**
 * The one live runtime for the running game, spawned at the middle of the island (the flat meadow).
 * Scene code imports this; tests build their own with `createRuntime`.
 */
export const runtime =
  createRuntime(
    {
      x: 16,
      z: 16,
    },
  );
