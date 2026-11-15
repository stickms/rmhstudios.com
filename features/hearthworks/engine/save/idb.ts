import {
  SaveFormatError,
  decodeWorld,
  encodeWorld,
} from './format';
import type { World } from '../world';

const DB =
  'hearthworks';
const STORE =
  'worlds';

function open(): Promise<IDBDatabase> {
  return new Promise(
    (
      resolve,
      reject,
    ) => {
      const req =
        indexedDB.open(
          DB,
          1,
        );
      req.onupgradeneeded =
        () =>
          req.result.createObjectStore(
            STORE,
          );
      req.onsuccess =
        () =>
          resolve(
            req.result,
          );
      req.onerror =
        () =>
          reject(
            req.error,
          );
    },
  );
}

/** Save a world locally. Resolves false (never throws) where storage is unavailable or blocked. */
export async function saveWorld(
  slot: string,
  world: World,
): Promise<boolean> {
  try {
    const db =
      await open();
    await new Promise<void>(
      (
        resolve,
        reject,
      ) => {
        const tx =
          db.transaction(
            STORE,
            'readwrite',
          );
        tx.objectStore(
          STORE,
        ).put(
          encodeWorld(
            world,
          ),
          slot,
        );
        tx.oncomplete =
          () =>
            resolve();
        tx.onerror =
          () =>
            reject(
              tx.error,
            );
      },
    );
    db.close();
    return true;
  } catch {
    return false;
  }
}

/** Load a world, or null if absent, unreadable or storage is unavailable. */
export async function loadWorld(
  slot: string,
): Promise<World | null> {
  try {
    const db =
      await open();
    const bytes =
      await new Promise<
        | Uint8Array
        | undefined
      >(
        (
          resolve,
          reject,
        ) => {
          const req =
            db
              .transaction(
                STORE,
              )
              .objectStore(
                STORE,
              )
              .get(
                slot,
              );
          req.onsuccess =
            () =>
              resolve(
                req.result as
                  | Uint8Array
                  | undefined,
              );
          req.onerror =
            () =>
              reject(
                req.error,
              );
        },
      );
    db.close();
    return bytes
      ? decodeWorld(
          bytes,
        )
      : null;
  } catch (e) {
    if (
      e instanceof
      SaveFormatError
    )
      return null;
    return null;
  }
}
