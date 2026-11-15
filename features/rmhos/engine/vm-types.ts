/** The machine's public surface. A leaf module: the strict island imports it, not vm.ts. */

export type VmPhase = 'idle' | 'downloading' | 'booting' | 'running' | 'stopped' | 'failed';

export type VmPhaseDetail = { loaded: number; total: number } | { error: string };

export interface VmHandle {
  onPhase(cb: (p: VmPhase, detail?: VmPhaseDetail) => void): () => void;
  onSerial1(cb: (chunk: string) => void): () => void;
  sendSerial1(text: string): void;
  /** How the machine started: restored from the shared snapshot, or a cold boot. */
  bootKind(): 'snapshot' | 'cold';
  /**
   * Whether keys go to the guest. v86 listens on `window`, not on the screen, so without this a
   * Tab, Space or Escape typed on a toolbar button or in a dialog would be swallowed by the guest.
   * The page turns it on while the screen has focus and off otherwise.
   */
  setKeyboardCapture(on: boolean): void;
  /** Sends key-up for every modifier (both Ctrl, Alt, Shift and Meta keys), so releasing the keyboard mid-chord leaves none held. */
  releaseModifiers(): void;
  writeShareFile(path: string, data: Uint8Array): Promise<void>;
  readShareFile(path: string): Promise<Uint8Array>;
  deleteShareFile(path: string): Promise<void>;
  restart(): Promise<void>;
  destroy(): void;
}
