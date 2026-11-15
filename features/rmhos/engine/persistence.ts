/**
 * Whether the browser promised to keep the stored files. Without that promise it may delete them
 * to free space (Chrome under disk pressure, Safari after seven days without a visit, "clear site
 * data"). `persist()` can show a permission prompt (Firefox), so it is asked only in response to a
 * click the person made on Save or on "Keep my files in this browser", never silently at the
 * first autosave. `persisted()` is read to tell the truth in the notice and in About.
 */
export interface StorageLike {
  persist?: () => Promise<boolean>;
  persisted?: () => Promise<boolean>;
}

const defaultStorage =
  ():
    | StorageLike
    | undefined =>
    (
      globalThis as {
        navigator?: {
          storage?: StorageLike;
        };
      }
    )
      .navigator
      ?.storage;

/**
 * true: the browser keeps the files. false: it may delete them. null: this browser cannot say
 * (no Storage API); nothing is claimed either way.
 */
export async function readPersisted(
  storage:
    | StorageLike
    | undefined = defaultStorage(),
): Promise<
  | boolean
  | null
> {
  if (
    !storage?.persisted
  )
    return null;
  try {
    return await storage.persisted();
  } catch {
    return null;
  }
}

/**
 * Asks the browser to keep the files. Call it synchronously from a click handler (the prompt some
 * browsers show needs that user activation) and read `persisted()` again after it settles.
 * Resolves to the browser's answer; false when it cannot be asked or refuses.
 */
export async function requestPersist(
  storage:
    | StorageLike
    | undefined = defaultStorage(),
): Promise<boolean> {
  if (
    !storage?.persist
  )
    return false;
  try {
    return await storage.persist();
  } catch {
    return false;
  }
}

/** The standing line is shown when the browser says it may delete the files (and not when it cannot say). */
export const evictionRisk =
  (
    persisted:
      | boolean
      | null,
  ): boolean =>
    persisted ===
    false;

/**
 * Wraps a request so it runs at most once: Save asks the browser through this, so a click on Save
 * never re-prompts (Firefox) after the first answer. The explicit "Keep my files in this
 * browser" button calls the request itself and is not limited.
 */
export function askOnce<
  T,
>(
  ask: () => Promise<T>,
): () => Promise<
  | T
  | undefined
> {
  let asked = false;
  return async () => {
    if (
      asked
    )
      return undefined;
    asked = true;
    return ask();
  };
}
