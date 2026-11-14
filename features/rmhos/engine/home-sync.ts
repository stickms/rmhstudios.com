/**
 * Moves the home folder between the guest and this browser. The guest writes a tar into the
 * 9p share on SAVE; this gzips it into IndexedDB (home-store.ts). Before RESTORE the stored
 * archive is gunzipped back into the share. Nothing is uploaded anywhere.
 */
import { AgentError, type AgentClient } from './agent';
import { SHARE_ARCHIVE_PATH } from './agent-protocol';
import type { CachedHome, HomeStore } from './home-store';
import type { VmHandle } from './vm-types';

export type SaveResult =
  | { status: 'saved'; bytes: number }
  | { status: 'unchanged' }
  | { status: 'storage-full' }
  | { status: 'failed'; code: string };

type Bytes = Uint8Array<ArrayBuffer>;

async function pipe(data: Uint8Array, t: CompressionStream | DecompressionStream): Promise<Bytes> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(t);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const gzip = (d: Uint8Array) => pipe(d, new CompressionStream('gzip'));
const gunzip = (d: Uint8Array) => pipe(d, new DecompressionStream('gzip'));

async function sha256Hex(d: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', d as BufferSource);
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** A tar has "ustar" at offset 257 of its first header; an empty archive is all zero blocks. */
function looksLikeTar(t: Uint8Array): boolean {
  if (t.length >= 262) {
    const magic = String.fromCharCode(...t.subarray(257, 262));
    if (magic === 'ustar') return true;
  }
  return t.every((b) => b === 0);
}

export class HomeSync {
  private inFlight: Promise<SaveResult> | null = null;
  private persisted = false;

  constructor(
    private readonly deps: {
      userId: string;
      vm: Pick<VmHandle, 'writeShareFile' | 'readShareFile' | 'deleteShareFile'>;
      agent: Pick<AgentClient, 'save'>;
      store: HomeStore;
    },
  ) {}

  /** Puts the stored tar in the share, before the guest is told to RESTORE. */
  async prepare(): Promise<'local' | 'empty'> {
    const cached = await this.deps.store.get(this.deps.userId);
    if (!cached) return 'empty';
    let tar: Bytes;
    try {
      tar = await gunzip(cached.archive);
    } catch {
      return 'empty';
    }
    await this.deps.vm.writeShareFile(SHARE_ARCHIVE_PATH, tar);
    return 'local';
  }

  save(opts: { timeoutMs?: number } = {}): Promise<SaveResult> {
    return (this.inFlight ??= this.doSave(opts.timeoutMs).finally(() => {
      this.inFlight = null;
    }));
  }

  private async doSave(timeoutMs?: number): Promise<SaveResult> {
    const { agent, vm, store, userId } = this.deps;
    try {
      await agent.save(timeoutMs);
      const tar = await vm.readShareFile(SHARE_ARCHIVE_PATH);
      await vm.deleteShareFile(SHARE_ARCHIVE_PATH).catch(() => {});
      // The hash is of the tar: gzip output of one input is stable, but hashing the input
      // does not depend on that. A tar whose mtimes changed is a different tar, and is saved.
      const sha256 = await sha256Hex(tar);
      const previous = await store.get(userId);
      if (previous?.sha256 === sha256) return { status: 'unchanged' };
      const archive = await gzip(tar);
      try {
        await store.put(userId, { archive, sha256, savedAt: Date.now() });
      } catch {
        return { status: 'storage-full' };
      }
      if (!this.persisted) {
        this.persisted = true;
        void Promise.resolve(globalThis.navigator?.storage?.persist?.()).catch(() => {});
      }
      return { status: 'saved', bytes: archive.length };
    } catch (e) {
      return { status: 'failed', code: e instanceof AgentError ? e.code : 'share' };
    }
  }

  /** The stored gzip, for a backup download. */
  async exportArchive(): Promise<Uint8Array | null> {
    return (await this.deps.store.get(this.deps.userId))?.archive ?? null;
  }

  /** Replaces the stored home with a backup. Takes effect at the next start. */
  async importArchive(gz: Uint8Array): Promise<void> {
    if (gz.length < 2 || gz[0] !== 0x1f || gz[1] !== 0x8b) throw new Error('not a gzip file');
    const tar = await gunzip(gz); // throws on a corrupt stream
    if (!looksLikeTar(tar)) throw new Error('not a tar archive');
    const entry: CachedHome = { archive: gz, sha256: await sha256Hex(tar), savedAt: Date.now() };
    await this.deps.store.put(this.deps.userId, entry);
  }
}
