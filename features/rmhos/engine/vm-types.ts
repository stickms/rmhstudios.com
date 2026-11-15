/** The machine's public surface. A leaf module: the strict island imports it, not vm.ts. */

export type VmPhase = 'idle' | 'downloading' | 'booting' | 'running' | 'stopped' | 'failed';

/**
 * Why a machine ended in `failed`, as a code the page maps to plain words (the technical text
 * stays in `error`, under "Details"):
 *  - `image-missing`: a boot file answered 404/410/416 (the image is not where the page expects it);
 *  - `image-invalid`: a boot file answered, but not usably (the disk server ignores Range, or it is
 *    not the file the page pinned);
 *  - `network`: a boot file could not be reached at all (offline, blocked, or missing CORS headers);
 *  - `stalled`: the download made no progress for too long;
 *  - `boot-timeout`: everything downloaded but the machine never came up;
 *  - `start`: the emulator itself could not be started;
 *  - `stopped`: the machine stopped by itself while the page was still starting it.
 */
export type BootFailureReason =
  | 'image-missing'
  | 'image-invalid'
  | 'network'
  | 'stalled'
  | 'boot-timeout'
  | 'start'
  | 'stopped';

export type VmPhaseDetail =
  | { loaded: number; total: number }
  | { error: string; reason?: BootFailureReason };

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
  destroy(): void;
}
