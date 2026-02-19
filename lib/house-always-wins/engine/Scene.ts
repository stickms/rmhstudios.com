import type { SceneTransition, DialogueData } from "../types";

export interface Scene {
  name: string;
  enter(payload?: Record<string, unknown>): void;
  update(dt: number): SceneTransition | null;
  render(ctx: CanvasRenderingContext2D): void;
  getActiveDialogue(): DialogueData | null;
  getPromptText(): string | null;
  handleDialogueChoice(action: string): void;
  getAreaLabel(): string;
}
