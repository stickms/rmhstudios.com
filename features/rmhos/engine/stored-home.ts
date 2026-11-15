/**
 * What this browser holds for an account, read straight from the HomeStore: the current archive,
 * the home a restored backup replaced (`:replaced`) and a damaged copy (`:damaged`). It needs no
 * machine, no agent and no session handshake, so a person can always list, download and delete
 * their files, whatever state the machine is in (loading, failed, locked by another tab,
 * corrupt, or an image that is not published at all).
 *
 * HomeSync (home-sync.ts) uses the same class for the same questions, so there is one place that
 * knows the key names.
 */
import type { CachedHome, HomeStore } from './home-store';

export type CopyKind = 'current' | 'replaced' | 'damaged';

export interface StoredCopy {
  /** Bytes of the stored gzip. */
  size: number;
  savedAt: number;
}

export interface StoredCopies {
  current: StoredCopy | null;
  replaced: StoredCopy | null;
  damaged: StoredCopy | null;
}

export class StoredHome {
  constructor(
    private readonly store: HomeStore,
    private readonly userId: string,
  ) {}

  private key(kind: CopyKind): string {
    return kind === 'current' ? this.userId : `${this.userId}:${kind}`;
  }

  /** What is stored, so none of it sits in the browser unseen. */
  async copies(): Promise<StoredCopies> {
    const info = (c: CachedHome | null) =>
      c ? { size: c.archive.length, savedAt: c.savedAt } : null;
    return {
      current: info(await this.store.get(this.key('current'))),
      replaced: info(await this.store.get(this.key('replaced'))),
      damaged: info(await this.store.get(this.key('damaged'))),
    };
  }

  /** The stored gzip of one copy, byte for byte (also when it is damaged). */
  async exportCopy(kind: CopyKind): Promise<Uint8Array | null> {
    return (await this.store.get(this.key(kind)))?.archive ?? null;
  }

  /** The current archive with when it was saved, for naming a stale copy honestly. */
  async info(): Promise<{ archive: Uint8Array; savedAt: number } | null> {
    const c = await this.store.get(this.key('current'));
    return c ? { archive: c.archive, savedAt: c.savedAt } : null;
  }

  /** Deletes one of the two extra copies (never the current one). */
  async removeCopy(kind: 'replaced' | 'damaged'): Promise<void> {
    // Runtime guard: the type is no protection against a stray string, and 'current' must never go.
    if (kind !== 'replaced' && kind !== 'damaged') throw new Error(`cannot remove copy: ${kind}`);
    await this.store.delete(this.key(kind));
  }
}

/**
 * The page's view of the stored files: nothing opens until a method is called (`getStore` is
 * lazy), and with no signed-in account every method answers "nothing stored".
 */
export interface StoredFiles {
  copies(): Promise<StoredCopies | null>;
  exportCopy(kind: CopyKind): Promise<Uint8Array | null>;
  info(): Promise<{ archive: Uint8Array; savedAt: number } | null>;
  removeCopy(kind: 'replaced' | 'damaged'): Promise<void>;
}

export function createStoredFiles(userId: string | null, getStore: () => HomeStore): StoredFiles {
  const home = () => (userId ? new StoredHome(getStore(), userId) : null);
  return {
    copies: async () => (await home()?.copies()) ?? null,
    exportCopy: async (kind) => (await home()?.exportCopy(kind)) ?? null,
    info: async () => (await home()?.info()) ?? null,
    removeCopy: async (kind) => void (await home()?.removeCopy(kind)),
  };
}
