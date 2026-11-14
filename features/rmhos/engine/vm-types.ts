/** The machine's public surface. A leaf module: the strict island imports it, not vm.ts. */

export type VmPhase = 'idle' | 'downloading' | 'booting' | 'running' | 'stopped' | 'failed';

export type VmPhaseDetail = { loaded: number; total: number } | { error: string };

export interface VmHandle {
  onPhase(cb: (p: VmPhase, detail?: VmPhaseDetail) => void): () => void;
  onSerial1(cb: (chunk: string) => void): () => void;
  sendSerial1(text: string): void;
  /** How the machine started: restored from the shared snapshot, or a cold boot. */
  bootKind(): 'snapshot' | 'cold';
  writeShareFile(path: string, data: Uint8Array): Promise<void>;
  readShareFile(path: string): Promise<Uint8Array>;
  deleteShareFile(path: string): Promise<void>;
  restart(): Promise<void>;
  destroy(): void;
}
