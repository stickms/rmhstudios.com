/**
 * The pure half of a Studio project session: what counts as a change, when an autosave is due, how the saved state
 * reads, how many samples a project is missing on this device, and which local projects are linked to the account.
 * `components/studio/useProjectSession.ts` wires these to the store, IndexedDB and the API; nothing here touches
 * either, so every rule is a plain test.
 */
import { MAX_PROJECT_NAME } from '@/lib/studio/project-schema';
import type { Clip, Pattern, Project, Track } from '@/lib/studio/types';

/** Autosave writes the local copy this long after the LAST change (a pause, not a fixed period). */
export const AUTOSAVE_IDLE_MS = 30_000;

// ─── Change tracking ────────────────────────────────────────────────────────

/** The parts of the store a saved project is made of. */
export interface ProjectContent {
  projectName: string;
  bpm: number;
  timeSignature: [number, number];
  tracks: Track[];
  clips: Record<string, Clip>;
  patterns: Pattern[];
  masterVolume: number;
}

/**
 * True when `next` differs from `prev` in anything a project file holds. Store updates are immutable, so a changed
 * part is a new reference; transport position, selection, zoom and the like do not count.
 */
export function contentChanged(prev: ProjectContent, next: ProjectContent): boolean {
  return (
    prev.projectName !== next.projectName ||
    prev.bpm !== next.bpm ||
    prev.timeSignature !== next.timeSignature ||
    prev.tracks !== next.tracks ||
    prev.clips !== next.clips ||
    prev.patterns !== next.patterns ||
    prev.masterVolume !== next.masterVolume
  );
}

/** Counts changes and remembers how many of them the last local save covered. */
export interface ChangeClock {
  changeCount: number;
  savedChangeCount: number;
  /** When the latest change happened; null before any. */
  lastChangeAt: number | null;
}

export const freshClock = (): ChangeClock => ({ changeCount: 0, savedChangeCount: 0, lastChangeAt: null });

export function recordChange(clock: ChangeClock, now: number): ChangeClock {
  return { ...clock, changeCount: clock.changeCount + 1, lastChangeAt: now };
}

/** A save that serialised the project when the change count was `coveredCount`; later changes stay unsaved. */
export function recordSaved(clock: ChangeClock, coveredCount: number): ChangeClock {
  return { ...clock, savedChangeCount: Math.max(clock.savedChangeCount, coveredCount) };
}

/** A project that was just loaded or created has nothing unsaved. */
export function markPristine(clock: ChangeClock): ChangeClock {
  return { ...clock, savedChangeCount: clock.changeCount, lastChangeAt: null };
}

export const isDirty = (clock: ChangeClock): boolean => clock.changeCount !== clock.savedChangeCount;

// ─── Autosave timing ────────────────────────────────────────────────────────

export type AutosaveDecision =
  | { kind: 'idle' }
  | { kind: 'wait'; ms: number }
  | { kind: 'save' };

/**
 * What the autosave timer should do now: nothing when there is nothing unsaved, wait out the rest of the idle
 * window, or save. Every new change pushes the window out again, so a long editing session saves when it pauses.
 */
export function autosaveDecision(clock: ChangeClock, now: number): AutosaveDecision {
  if (!isDirty(clock) || clock.lastChangeAt === null) return { kind: 'idle' };
  const remaining = clock.lastChangeAt + AUTOSAVE_IDLE_MS - now;
  return remaining > 0 ? { kind: 'wait', ms: remaining } : { kind: 'save' };
}

/** Leaving the page writes the local copy if anything is unsaved; it never uploads. */
export const savesOnPageHide = (clock: ChangeClock): boolean => isDirty(clock);

/** The browser's own "leave site?" prompt is set exactly while something is unsaved. */
export const warnsBeforeUnload = (clock: ChangeClock): boolean => isDirty(clock);

// ─── Saved state ────────────────────────────────────────────────────────────

export type SaveState = 'saved' | 'unsaved' | 'saving' | 'error';

/** The toolbar's state word: a save in flight wins, then a failed save, then unsaved changes. */
export function deriveSaveState(input: { dirty: boolean; saving: boolean; failed: boolean }): SaveState {
  if (input.saving) return 'saving';
  if (input.failed) return 'error';
  return input.dirty ? 'unsaved' : 'saved';
}

// ─── Names ──────────────────────────────────────────────────────────────────

/** A name the member typed, or null when it is empty or too long. */
export function normalizeProjectName(raw: string): string | null {
  const name = raw.trim();
  return name.length >= 1 && name.length <= MAX_PROJECT_NAME ? name : null;
}

/** A project's size as a short localised figure ("340 kB", "1.2 MB"). */
export function formatProjectSize(bytes: number, locale: string): string {
  const mega = bytes >= 1_000_000;
  return new Intl.NumberFormat(locale || 'en', {
    style: 'unit',
    unit: mega ? 'megabyte' : 'kilobyte',
    unitDisplay: 'short',
    maximumFractionDigits: mega ? 1 : 0,
  }).format(mega ? bytes / 1_000_000 : Math.max(1, Math.round(bytes / 1000)));
}

// ─── Samples ────────────────────────────────────────────────────────────────

/**
 * How many distinct audio samples the project's clips use that are not in `available` (the sample ids on this
 * device). A clip with no sample yet (`bufferId` empty) is not missing one. Those clips stay in the project and play
 * silent; this is only the number the notice reports.
 */
export function countMissingSamples(
  clips: Record<string, Clip>,
  available: ReadonlySet<string>,
): number {
  const missing = new Set<string>();
  for (const clip of Object.values(clips)) {
    if (clip.type === 'audio' && clip.bufferId !== '' && !available.has(clip.bufferId)) {
      missing.add(clip.bufferId);
    }
  }
  return missing.size;
}

// ─── Account links ──────────────────────────────────────────────────────────

/**
 * Which local projects have a copy on the account, and the revision this device last synced: `{ projectId:
 * revision }`. Kept per member in the browser so "Save" still updates both after a reload. A malformed value reads
 * as no links, never as an error.
 */
export type CloudLinks = Record<string, number>;

export function parseCloudLinks(raw: string | null): CloudLinks {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const links: CloudLinks = {};
    for (const [id, revision] of Object.entries(parsed)) {
      if (typeof revision === 'number' && Number.isInteger(revision) && revision >= 1) links[id] = revision;
    }
    return links;
  } catch {
    return {};
  }
}

export function withLink(links: CloudLinks, id: string, revision: number): CloudLinks {
  return { ...links, [id]: revision };
}

export function withoutLink(links: CloudLinks, id: string): CloudLinks {
  const rest = { ...links };
  delete rest[id];
  return rest;
}

// ─── Building a project ─────────────────────────────────────────────────────

/** The project file for the store's current content. `createdAt` is kept from the first save. */
export function buildProject(
  id: string,
  content: ProjectContent,
  createdAt: number,
  now: number,
): Project {
  return {
    id,
    name: content.projectName,
    bpm: content.bpm,
    timeSignature: content.timeSignature,
    tracks: content.tracks,
    clips: content.clips,
    patterns: content.patterns,
    masterVolume: content.masterVolume,
    createdAt,
    updatedAt: now,
  };
}
