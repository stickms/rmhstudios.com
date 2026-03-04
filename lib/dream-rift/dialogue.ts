import type { DialogueLine } from './types';

/**
 * DialogueManager — controls the flow of dialogue sequences.
 *
 * Usage:
 *   const dm = new DialogueManager();
 *   dm.start(lines, () => console.log('done'));
 *   while (dm.isActive()) {
 *     render(dm.getCurrentLine());
 *     dm.advance();
 *   }
 */
export class DialogueManager {
  private lines: DialogueLine[] = [];
  private currentIndex = 0;
  private active = false;
  private onComplete?: () => void;

  /**
   * Begin a dialogue sequence.
   * @param lines    The ordered dialogue lines to display.
   * @param onComplete  Optional callback invoked when the last line is advanced past.
   */
  start(lines: DialogueLine[], onComplete?: () => void): void {
    if (lines.length === 0) {
      onComplete?.();
      return;
    }
    this.lines = lines;
    this.currentIndex = 0;
    this.active = true;
    this.onComplete = onComplete;
  }

  /** Whether a dialogue sequence is currently in progress. */
  isActive(): boolean {
    return this.active;
  }

  /** The line currently being displayed, or null if inactive. */
  getCurrentLine(): DialogueLine | null {
    if (!this.active) return null;
    return this.lines[this.currentIndex] ?? null;
  }

  /** The 0-based index of the current line. */
  getCurrentIndex(): number {
    return this.currentIndex;
  }

  /** Total number of lines in the current sequence. */
  getLineCount(): number {
    return this.lines.length;
  }

  /**
   * Advance to the next line. If the current line was the last one,
   * the dialogue ends and onComplete is called.
   */
  advance(): void {
    if (!this.active) return;

    this.currentIndex++;

    if (this.currentIndex >= this.lines.length) {
      this.finish();
    }
  }

  /** Skip all remaining lines and finish immediately. */
  skip(): void {
    if (!this.active) return;
    this.finish();
  }

  /** Internal: mark dialogue as complete and fire callback. */
  private finish(): void {
    this.active = false;
    this.currentIndex = 0;
    this.lines = [];
    const cb = this.onComplete;
    this.onComplete = undefined;
    cb?.();
  }
}
