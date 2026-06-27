import type { DialogueData } from "../types";

// A top-level scene (intro ritual, or the explorable world). Room-to-room
// movement is handled *inside* the world scene; scenes only switch at major
// boundaries (intro → world).
export interface SceneSwitch {
  to: string;
}

export interface Scene {
  name: string;
  enter(payload?: Record<string, unknown>): void;
  update(dt: number): SceneSwitch | null;
  render(ctx: CanvasRenderingContext2D): void;
  getActiveDialogue(): DialogueData | null;
  getPromptText(): string | null;
  handleDialogueChoice(action: string): void;
  getAreaLabel(): string;
}
