/**
 * The project model: an overlay of the author's files on top of the shared
 * "TF2 Default" base. A file the author never touched is not stored at all —
 * it is read from the base — which keeps a project small, makes "what did I
 * change" a set lookup, and lets a user zip contain only what they edited.
 */

export type FileContent =
  | { kind: 'text'; text: string; sha1: string }
  | { kind: 'binary'; bytes: Uint8Array; sha1: string };

/** `null` marks a base file the author deleted. */
export type Overlay = ReadonlyMap<string, FileContent | null>;

export interface HudMeta {
  name: string;
  description: string;
  author: string;
  /** Free-form, shown in the workshop. */
  tags: string[];
}

export interface BaseEntry {
  size: number;
  sha1: string;
}

export interface BaseIndex {
  version: number;
  source: { repo: string; commit: string; license: string };
  files: ReadonlyMap<string, BaseEntry>;
}

export type FileStatus = 'unchanged' | 'modified' | 'added' | 'deleted';

export const DEFAULT_META: HudMeta = {
  name: 'My HUD',
  description: '',
  author: '',
  tags: [],
};
