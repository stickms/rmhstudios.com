/**
 * Moves the home folder between the guest and this browser. The guest writes a tar into the
 * 9p share on SAVE; this gzips it into IndexedDB (home-store.ts). Before RESTORE the stored
 * archive is gunzipped back into the share. Nothing is uploaded anywhere.
 */
import {
  AgentError,
  type AgentClient,
} from './agent';
import { SHARE_ARCHIVE_PATH } from './agent-protocol';
import type {
  CachedHome,
  HomeStore,
  StoreOp,
} from './home-store';
import {
  acquireHomeLock,
  type AcquireOptions,
} from './tab-lock';
import {
  StoredHome,
  type CopyKind,
  type StoredCopies,
} from './stored-home';
import type { VmHandle } from './vm-types';

export type SaveResult =
  | {
      status: 'saved';
      bytes: number;
    }
  | {
      status: 'unchanged';
    }
  | {
      status: 'storage-full';
    }
  /**
   * Nothing was written. Codes: the agent's own (timeout, busy, ...), `share` (the tar could not be
   * read), `bad_archive`, `empty_home`, `suspended` (a backup was imported; restart to use it),
   * `changed_elsewhere` (another tab replaced the stored home), `storage_error`.
   */
  | {
      status: 'failed';
      code: string;
    };

type Bytes =
  Uint8Array<ArrayBuffer>;

/**
 * Runs `data` through a (de)compression stream. The bytes are written to the stream as one chunk
 * and the output is collected by a Response: no Blob copy of the input (a tar can be 100 MB) and
 * no second wrapper around the result.
 */
async function pipe(
  data: Uint8Array,
  t:
    | CompressionStream
    | DecompressionStream,
): Promise<Bytes> {
  const writer =
    t.writable.getWriter();
  const written =
    writer
      .write(
        data as Uint8Array<ArrayBuffer>,
      )
      .then(
        () =>
          writer.close(),
      );
  // A failed write (a corrupt gzip) rejects the read side too; that is the error to report.
  written.catch(
    () => {},
  );
  return new Uint8Array(
    await new Response(
      t.readable,
    ).arrayBuffer(),
  );
}

const gzip =
  (
    d: Uint8Array,
  ) =>
    pipe(
      d,
      new CompressionStream(
        'gzip',
      ),
    );
const gunzip =
  (
    d: Uint8Array,
  ) =>
    pipe(
      d,
      new DecompressionStream(
        'gzip',
      ),
    );

async function sha256Hex(
  d: Uint8Array,
): Promise<string> {
  const h =
    await crypto.subtle.digest(
      'SHA-256',
      d as BufferSource,
    );
  return Array.from(
    new Uint8Array(
      h,
    ),
    (
      b,
    ) =>
      b
        .toString(
          16,
        )
        .padStart(
          2,
          '0',
        ),
  ).join(
    '',
  );
}

/** A tar has "ustar" at offset 257 of its first header; an empty archive is all zero blocks. */
function looksLikeTar(
  t: Uint8Array,
): boolean {
  if (
    t.length >=
    262
  ) {
    const magic =
      String.fromCharCode(
        ...t.subarray(
          257,
          262,
        ),
      );
    if (
      magic ===
      'ustar'
    )
      return true;
  }
  return t.every(
    (
      b,
    ) =>
      b ===
      0,
  );
}

/** No entries: the first header block is missing or all zero. */
function tarIsEmpty(
  t: Uint8Array,
): boolean {
  return t
    .subarray(
      0,
      512,
    )
    .every(
      (
        b,
      ) =>
        b ===
        0,
    );
}

/** Throws unless `gz` is a gzip of a tar archive. Returns the tar. Writes nothing. */
export async function checkBackup(
  gz: Uint8Array,
): Promise<Bytes> {
  if (
    gz.length <
      2 ||
    gz[0] !==
      0x1f ||
    gz[1] !==
      0x8b
  )
    throw new Error(
      'not a gzip file',
    );
  const tar =
    await gunzip(
      gz,
    ); // throws on a corrupt stream
  if (
    !looksLikeTar(
      tar,
    )
  )
    throw new Error(
      'not a tar archive',
    );
  return tar;
}

export type {
  CopyKind,
  StoredCopies,
  StoredCopy,
} from './stored-home';

/** Why a backup could not be stored. */
export class BackupError extends Error {
  /**
   * `invalid`: not a backup. `storage-full` / `storage_error`: the put failed, nothing changed.
   * `damaged_exists`: an earlier damaged copy is stored and another would have to be kept: the
   * operation was refused before anything was touched. `previous_stale`: the home that a backup
   * replaced can no longer be put back (the restored backup has been saved over, or is gone).
   * `locked`: another tab of this account holds the per-account lock (it may be running the
   * machine, which saves over the store), so nothing was written.
   */
  constructor(
    readonly code:
      | 'invalid'
      | 'storage-full'
      | 'storage_error'
      | 'damaged_exists'
      | 'previous_stale'
      | 'locked',
  ) {
    super(
      code,
    );
    this.name =
      'BackupError';
  }
}

const isQuota =
  (
    e: unknown,
  ) =>
    e instanceof
      Error &&
    e.name ===
      'QuotaExceededError';

/** `prepare()` outcome. `corrupt`: a stored archive exists and cannot be read; nothing was touched. */
export interface SaveOptions {
  timeoutMs?: number;
  allowEmpty?: boolean;
  /**
   * The guest already wrote its home to the share on its own (`saved-on-poweroff`) and said how
   * long the tar is: read the share instead of sending SAVE.
   */
  alreadySaved?: {
    bytes: number;
  };
}

export type PrepareResult =
  | 'local'
  | 'empty'
  | 'corrupt';

/**
 * `<userId>:meta`: a record with no archive that holds the sha256 and save time of the current
 * entry. A save compares against it instead of reading the whole previous archive (tens of
 * megabytes) just to learn its hash. Every transaction that writes or deletes the current entry
 * writes or deletes this one in the same transaction. An entry saved before this key existed has
 * none: the first save reads the archive once, then writes the key with the new archive.
 */
const metaKey =
  (
    userId: string,
  ) =>
    `${userId}:meta`;
const metaEntry =
  (e: {
    sha256: string;
    savedAt: number;
  }): CachedHome => ({
    archive:
      new Uint8Array(
        0,
      ),
    sha256:
      e.sha256,
    savedAt:
      e.savedAt,
  });

export class HomeSync {
  private inFlight: Promise<SaveResult> | null =
    null;
  private suspended = false;
  /** sha256 of the tar this session loaded, or last wrote; null = nothing stored. */
  private knownSha:
    | string
    | null =
    null;
  private readonly stored: StoredHome;

  constructor(
    private readonly deps: {
      userId: string;
      vm: Pick<
        VmHandle,
        | 'writeShareFile'
        | 'readShareFile'
        | 'deleteShareFile'
      >;
      agent: Pick<
        AgentClient,
        'save'
      >;
      store: HomeStore;
    },
  ) {
    this.stored =
      new StoredHome(
        deps.store,
        deps.userId,
      );
  }

  /** Where the archives live (see HomeStore.kind). */
  get storeKind():
    | 'indexeddb'
    | 'memory' {
    return this
      .deps
      .store
      .kind;
  }

  /**
   * Puts the stored tar in the share, before the guest is told to RESTORE. A stored archive that
   * cannot be read is `corrupt`, never `empty`: the caller must stop, because a boot with an empty
   * home would let the next save replace the only copy.
   */
  async prepare(): Promise<PrepareResult> {
    const cached =
      await this.deps.store.get(
        this
          .deps
          .userId,
      );
    // No main entry, or an unreadable one: a `:replaced` stays, and what happens to it is the
    // person's decision (Stored copies lists it with Download and Remove).
    if (
      !cached
    ) {
      this.knownSha =
        null;
      return 'empty';
    }
    this.knownSha =
      cached.sha256;
    let tar: Bytes;
    try {
      tar =
        await checkBackup(
          cached.archive,
        );
    } catch {
      return 'corrupt';
    }
    // The main entry is readable: a leftover `:replaced` whose backup it no longer is can never
    // be put back.
    await this.dropStaleReplaced(
      cached,
    );
    await this.deps.vm.writeShareFile(
      SHARE_ARCHIVE_PATH,
      tar,
    );
    return 'local';
  }

  /**
   * After `prepare()` said `corrupt` and the person chose to go on: the unreadable entry is moved
   * to `<userId>:damaged` (kept, not deleted) and the next start has an empty home. Refused with
   * `damaged_exists`, touching nothing, when an earlier damaged copy is still stored: a damaged
   * archive is never discarded to make room.
   */
  async discardDamaged(): Promise<void> {
    const {
      store,
      userId,
    } =
      this
        .deps;
    const cached =
      await store.get(
        userId,
      );
    if (
      !cached
    )
      return;
    if (
      await store.get(
        `${userId}:damaged`,
      )
    )
      throw new BackupError(
        'damaged_exists',
      );
    try {
      // One transaction: the copy is kept and the main entry removed together, or neither.
      await store.transact(
        [
          {
            key: `${userId}:damaged`,
            put: cached,
          },
          {
            key: userId,
            delete: true,
          },
          {
            key: metaKey(
              userId,
            ),
            delete: true,
          },
        ],
      );
    } catch (e) {
      throw new BackupError(
        isQuota(
          e,
        )
          ? 'storage-full'
          : 'storage_error',
      );
    }
    this.knownSha =
      null;
  }

  /** Stops this instance writing for good (it is being replaced by a new machine's). */
  suspend(): void {
    this.suspended = true;
  }

  save(
    opts: SaveOptions = {},
  ): Promise<SaveResult> {
    if (
      this
        .suspended
    )
      return Promise.resolve(
        {
          status:
            'failed',
          code: 'suspended',
        },
      );
    return (this.inFlight ??=
      this.doSave(
        opts,
      ).finally(
        () => {
          this.inFlight =
            null;
        },
      ));
  }

  /** Asks the guest for its home as a tar and checks what arrived. Throws `bad_archive` or the agent's error. */
  private async readGuestTar(
    timeoutMs?: number,
    alreadySaved?: {
      bytes: number;
    },
  ): Promise<Bytes> {
    const {
      agent,
      vm,
    } =
      this
        .deps;
    const {
      bytes,
    } =
      alreadySaved ??
      (await agent.save(
        timeoutMs,
      ));
    // v86 hands back its own copy of the file: used as is, not copied again.
    const tar =
      (await vm.readShareFile(
        SHARE_ARCHIVE_PATH,
      )) as Bytes;
    await vm
      .deleteShareFile(
        SHARE_ARCHIVE_PATH,
      )
      .catch(
        () => {},
      );
    // The guest says how long the tar is; what was read must be exactly that, and a tar.
    if (
      tar.length !==
        bytes ||
      tar.length ===
        0 ||
      !looksLikeTar(
        tar,
      )
    )
      throw new Error(
        'bad_archive',
      );
    return tar;
  }

  /**
   * The sha256 of the stored current entry, without reading its archive: from `<userId>:meta`
   * when there is one and the entry it describes is still there, else (an entry saved before the
   * meta key existed) from the entry itself.
   */
  private async storedSha(): Promise<
    | string
    | null
  > {
    const {
      store,
      userId,
    } =
      this
        .deps;
    const meta =
      await store.get(
        metaKey(
          userId,
        ),
      );
    if (
      meta?.sha256 &&
      (await store.has(
        userId,
      ))
    )
      return meta.sha256;
    return (
      (
        await store.get(
          userId,
        )
      )
        ?.sha256 ??
      null
    );
  }

  private async doSave(
    opts: SaveOptions,
  ): Promise<SaveResult> {
    const {
      store,
      userId,
    } =
      this
        .deps;
    let tar: Bytes;
    try {
      tar =
        await this.readGuestTar(
          opts.timeoutMs,
          opts.alreadySaved,
        );
    } catch (e) {
      if (
        e instanceof
          Error &&
        e.message ===
          'bad_archive'
      )
        return {
          status:
            'failed',
          code: 'bad_archive',
        };
      return {
        status:
          'failed',
        code:
          e instanceof
          AgentError
            ? e.code
            : 'share',
      };
    }
    try {
      const storedSha =
        await this.storedSha();
      // Another tab (or an import) replaced the stored home since this session read or wrote it.
      if (
        storedSha !==
        this
          .knownSha
      )
        return {
          status:
            'failed',
          code: 'changed_elsewhere',
        };
      // The hash is of the tar: gzip output of one input is stable, but hashing the input
      // does not depend on that. A tar whose mtimes changed is a different tar, and is saved.
      const sha256 =
        await sha256Hex(
          tar,
        );
      if (
        storedSha ===
        sha256
      )
        return {
          status:
            'unchanged',
        };
      if (
        storedSha !==
          null &&
        !opts.allowEmpty &&
        tarIsEmpty(
          tar,
        )
      ) {
        // Only now is the stored archive read: an empty home over a stored one is the rare case.
        let storedEmpty = false;
        try {
          const previous =
            await store.get(
              userId,
            );
          storedEmpty =
            previous
              ? tarIsEmpty(
                  await checkBackup(
                    previous.archive,
                  ),
                )
              : false;
        } catch {
          // An unreadable stored archive counts as non-empty: never replace it with nothing.
        }
        if (
          !storedEmpty
        )
          return {
            status:
              'failed',
            code: 'empty_home',
          };
      }
      const archive =
        await gzip(
          tar,
        );
      // Replaced or disposed while this save was running: nothing may land after that.
      if (
        this
          .suspended
      )
        return {
          status:
            'failed',
          code: 'suspended',
        };
      try {
        // The home now differs from the restored backup, so the home it replaced can no longer be
        // put back and goes with this write: one transaction, so a failed save leaves both alone.
        const entry =
          {
            archive,
            sha256,
            savedAt:
              Date.now(),
          };
        await store.transact(
          [
            {
              key: userId,
              put: entry,
            },
            {
              key: metaKey(
                userId,
              ),
              put: metaEntry(
                entry,
              ),
            },
            {
              key: `${userId}:replaced`,
              delete: true,
            },
          ],
        );
      } catch (e) {
        return isQuota(
          e,
        )
          ? {
              status:
                'storage-full',
            }
          : {
              status:
                'failed',
              code: 'storage_error',
            };
      }
      this.knownSha =
        sha256;
      return {
        status:
          'saved',
        bytes:
          archive.length,
      };
    } catch {
      return {
        status:
          'failed',
        code: 'storage_error',
      };
    }
  }

  /**
   * The desktop's home as a gzip, straight from the guest, without touching the store. For a
   * backup when saving is not possible (another tab changed the entry, storage is full).
   */
  async exportLive(): Promise<Uint8Array> {
    await this.inFlight?.catch(
      () => {},
    );
    return gzip(
      await this.readGuestTar(),
    );
  }

  /** The stored gzip and when it was saved, for naming a stale copy honestly. */
  storedInfo(): Promise<{
    archive: Uint8Array;
    savedAt: number;
  } | null> {
    return this.stored.info();
  }

  /** The stored gzip, byte for byte (also when it is damaged), for a backup download. */
  exportArchive(): Promise<Uint8Array | null> {
    return this.stored.exportCopy(
      'current',
    );
  }

  /**
   * Replaces the stored home with a backup, and suspends this instance: its guest still holds the
   * old home, and a later save from it would replace the backup. The only way out is a restart,
   * which builds a new HomeSync that loads the backup. The home it replaces is kept once, under
   * `<userId>:replaced`, so a backup that passes validation but fails RESTORE in the guest does
   * not cost the old files. Throws a BackupError: `invalid` (nothing touched), `storage-full` or
   * `storage_error` (the old archive stays, saving works again).
   */
  async importArchive(
    gz: Uint8Array,
  ): Promise<void> {
    const {
      store,
      userId,
    } =
      this
        .deps;
    let tar: Bytes;
    try {
      tar =
        await checkBackup(
          gz,
        );
    } catch {
      throw new BackupError(
        'invalid',
      );
    }
    const entry: CachedHome =
      {
        archive:
          gz,
        sha256:
          await sha256Hex(
            tar,
          ),
        savedAt:
          Date.now(),
      };
    // Suspend first: a save already past its own checks must not land after the import.
    const wasSuspended =
      this
        .suspended;
    this.suspended = true;
    try {
      await this.inFlight?.catch(
        () => {},
      );
      const previous =
        await store.get(
          userId,
        );
      const ops: StoreOp[] =
        [];
      if (
        previous &&
        previous.sha256 !==
          entry.sha256
      ) {
        const kept =
          await store.get(
            `${userId}:replaced`,
          );
        // Is the stored home still an unmodified imported backup (the one `:replaced` is for)?
        const stillBackup =
          !!kept?.forSha &&
          previous.sha256 ===
            kept.forSha;
        let readable = true;
        try {
          await checkBackup(
            previous.archive,
          );
        } catch {
          readable = false;
        }
        if (
          !readable
        ) {
          // An unreadable current archive has to be kept, and there is room for one copy only.
          if (
            await store.get(
              `${userId}:damaged`,
            )
          )
            throw new BackupError(
              'damaged_exists',
            );
          ops.push(
            {
              key: `${userId}:damaged`,
              put: previous,
            },
          );
        }
        if (
          stillBackup
        ) {
          // The original home stays the one previous copy, now for this backup.
          ops.push(
            {
              key: `${userId}:replaced`,
              put: {
                ...kept!,
                forSha:
                  entry.sha256,
              },
            },
          );
        } else if (
          readable
        ) {
          ops.push(
            {
              key: `${userId}:replaced`,
              put: {
                ...previous,
                forSha:
                  entry.sha256,
              },
            },
          );
        }
      }
      ops.push(
        {
          key: userId,
          put: entry,
        },
        {
          key: metaKey(
            userId,
          ),
          put: metaEntry(
            entry,
          ),
        },
      );
      // Every key moves together or none does: a failure leaves the old home, its previous
      // copy and the offer to put it back exactly as they were.
      await store.transact(
        ops,
      );
    } catch (e) {
      this.suspended =
        wasSuspended; // nothing was replaced: saving can go on
      if (
        e instanceof
        BackupError
      )
        throw e;
      throw new BackupError(
        isQuota(
          e,
        )
          ? 'storage-full'
          : 'storage_error',
      );
    }
    this.knownSha =
      entry.sha256;
  }

  /**
   * The home a restored backup replaced, if it can still be put back: only while the stored home
   * is still exactly that backup (it has never been saved over). Otherwise null.
   */
  async previousOffer(): Promise<{
    savedAt: number;
  } | null> {
    const {
      store,
      userId,
    } =
      this
        .deps;
    const replaced =
      await store.get(
        `${userId}:replaced`,
      );
    if (
      !replaced?.forSha
    )
      return null;
    const main =
      await store.get(
        userId,
      );
    return main?.sha256 ===
      replaced.forSha
      ? {
          savedAt:
            replaced.savedAt,
        }
      : null;
  }

  /**
   * Puts the home a backup replaced back as the stored one. Refused (`previous_stale`) unless the
   * stored home is still the backup it was replaced for, checked here again: that backup is the
   * failed import the person supplied (they still have the file), so no copy of it is kept.
   * Writes the main entry first, then removes `:replaced`. Suspends this instance like an import.
   */
  async putPreviousBack(): Promise<void> {
    const {
      store,
      userId,
    } =
      this
        .deps;
    this.suspended = true;
    try {
      await this.inFlight?.catch(
        () => {},
      );
      const replaced =
        await store.get(
          `${userId}:replaced`,
        );
      const main =
        await store.get(
          userId,
        );
      if (
        !replaced?.forSha ||
        main?.sha256 !==
          replaced.forSha
      ) {
        throw new BackupError(
          'previous_stale',
        );
      }
      await store.transact(
        [
          {
            key: userId,
            put: {
              archive:
                replaced.archive,
              sha256:
                replaced.sha256,
              savedAt:
                replaced.savedAt,
            },
          },
          {
            key: metaKey(
              userId,
            ),
            put: metaEntry(
              replaced,
            ),
          },
          {
            key: `${userId}:replaced`,
            delete: true,
          },
        ],
      );
      this.knownSha =
        replaced.sha256;
    } catch (e) {
      if (
        e instanceof
        BackupError
      )
        throw e;
      throw new BackupError(
        isQuota(
          e,
        )
          ? 'storage-full'
          : 'storage_error',
      );
    }
  }

  private async dropStaleReplaced(
    main: CachedHome | null,
  ): Promise<void> {
    const {
      store,
      userId,
    } =
      this
        .deps;
    try {
      const replaced =
        await store.get(
          `${userId}:replaced`,
        );
      if (
        replaced &&
        (!replaced.forSha ||
          main?.sha256 !==
            replaced.forSha)
      ) {
        await store.delete(
          `${userId}:replaced`,
        );
      }
    } catch {
      // a leftover stays until the next start
    }
  }

  /** What is stored for this account, so none of it sits in the browser unseen. */
  storedCopies(): Promise<StoredCopies> {
    return this.stored.copies();
  }

  /** The stored gzip of one copy, byte for byte. */
  exportCopy(
    kind: CopyKind,
  ): Promise<Uint8Array | null> {
    return this.stored.exportCopy(
      kind,
    );
  }

  /** Deletes one of the two extra copies (never the current one). */
  removeCopy(
    kind:
      | 'replaced'
      | 'damaged',
  ): Promise<void> {
    return this.stored.removeCopy(
      kind,
    );
  }
}

/**
 * Stores a backup for the account with no machine running (halted, stopped or powered off): the
 * same validation, previous-copy and damaged-copy rules as `HomeSync.importArchive`, which only
 * ever touches the store. The caller restarts the machine afterwards, which loads the backup.
 */
export async function importWithoutMachine(
  userId: string,
  store: HomeStore,
  gz: Uint8Array,
  lockOptions: AcquireOptions = {},
): Promise<void> {
  // The store is written, so the per-account Web Lock is held for the whole import: a machine
  // running in another tab saves over the same entry and would undo (or tear) the backup.
  const lock =
    await acquireHomeLock(
      userId,
      lockOptions,
    );
  if (
    !lock
  )
    throw new BackupError(
      'locked',
    );
  try {
    const noMachine =
      () =>
        Promise.reject(
          new Error(
            'no machine',
          ),
        );
    const sync =
      new HomeSync(
        {
          userId,
          store,
          vm: {
            writeShareFile:
              noMachine,
            readShareFile:
              noMachine,
            deleteShareFile:
              noMachine,
          },
          agent:
            {
              save: noMachine,
            },
        },
      );
    await sync.importArchive(
      gz,
    );
  } finally {
    lock.release();
  }
}
