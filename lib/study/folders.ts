/** Deck folders: the limits, name rule and ordering moves shared by the server and the deck list. Pure. */

/** Folders one member may own. */
export const MAX_FOLDERS_PER_MEMBER = 30;
/** Characters in a folder name. */
export const FOLDER_NAME_MAX = 40;

/** What a member's folder list holds. Private to the owner: never part of a public payload. */
export interface DeckFolderSummary {
  id: string;
  name: string;
  position: number;
  collapsed: boolean;
}

/** A name as stored: trimmed, inner whitespace collapsed. Null when nothing is left or it is too long. */
export function normalizeFolderName(raw: string): string | null {
  const name = raw.replace(/\s+/g, ' ').trim();
  if (name.length === 0 || name.length > FOLDER_NAME_MAX) return null;
  return name;
}

/** Whether two names are the same folder name (case ignored). */
export function sameFolderName(a: string, b: string): boolean {
  return a.toLocaleLowerCase() === b.toLocaleLowerCase();
}

/**
 * The ids in their new order after moving `id` one step. Returns null when the id is not in the list;
 * a move past either end changes nothing.
 */
export function moveWithin(ids: readonly string[], id: string, direction: 'up' | 'down'): string[] | null {
  const from = ids.indexOf(id);
  if (from < 0) return null;
  const to = direction === 'up' ? from - 1 : from + 1;
  const next = [...ids];
  if (to < 0 || to >= next.length) return next;
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved as string);
  return next;
}

/** A group of decks in the list: one folder's, or the decks with no folder. */
export interface DeckGroup<D> {
  folder: DeckFolderSummary | null;
  decks: D[];
  /** Cards due across the group's decks (suspended cards are already left out of each deck's count). */
  due: number;
}

/**
 * The deck list grouped by folder: every folder in order (empty ones included), then the decks with no
 * folder. A deck whose folder is unknown counts as having none.
 */
export function groupDecks<D extends { folderId?: string | null; dueCount?: number }>(
  decks: readonly D[],
  folders: readonly DeckFolderSummary[],
): DeckGroup<D>[] {
  const ordered = [...folders].sort((a, b) => a.position - b.position);
  const byFolder = new Map<string, D[]>(ordered.map((f) => [f.id, []]));
  const loose: D[] = [];
  for (const d of decks) {
    const bucket = d.folderId ? byFolder.get(d.folderId) : undefined;
    if (bucket) bucket.push(d);
    else loose.push(d);
  }
  const sum = (list: D[]) => list.reduce((n, d) => n + (d.dueCount ?? 0), 0);
  const groups: DeckGroup<D>[] = ordered.map((f) => {
    const list = byFolder.get(f.id) ?? [];
    return { folder: f, decks: list, due: sum(list) };
  });
  groups.push({ folder: null, decks: loose, due: sum(loose) });
  return groups;
}
