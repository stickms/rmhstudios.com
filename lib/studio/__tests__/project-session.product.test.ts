import { describe, expect, it } from 'vitest';
import {
  AUTOSAVE_IDLE_MS,
  autosaveDecision,
  buildProject,
  contentChanged,
  countMissingSamples,
  formatProjectSize,
  deriveSaveState,
  freshClock,
  isDirty,
  markPristine,
  normalizeProjectName,
  parseCloudLinks,
  recordChange,
  recordSaved,
  savesOnPageHide,
  warnsBeforeUnload,
  withLink,
  withoutLink,
  type ProjectContent,
} from '@/lib/studio/project-session';
import { createProjectBody, studioProjectSchema } from '@/lib/studio/project-schema';
import { useStudioStore } from '@/lib/studio/store';
import type { AudioClipData, Clip, Track } from '@/lib/studio/types';

function audioClip(id: string, bufferId: string): AudioClipData {
  return {
    id,
    trackId: 't1',
    type: 'audio',
    name: id,
    startBeat: 0,
    durationBeats: 4,
    color: '#fff',
    bufferId,
    sampleOffset: 0,
    fadeInBeats: 0,
    fadeOutBeats: 0,
  };
}

const track: Track = {
  id: 't1',
  name: 'Audio 1',
  type: 'audio',
  color: '#fff',
  volume: 1,
  pan: 0,
  muted: false,
  soloed: false,
  armed: false,
  clipIds: [],
  pluginChain: [],
  sends: [],
  height: 80,
};

describe('dirty tracking', () => {
  it('starts clean, becomes dirty on a change and clean again once that change is saved', () => {
    let clock = freshClock();
    expect(isDirty(clock)).toBe(false);
    clock = recordChange(clock, 1000);
    expect(isDirty(clock)).toBe(true);
    clock = recordSaved(clock, clock.changeCount);
    expect(isDirty(clock)).toBe(false);
  });

  it('keeps changes made while a save was in flight unsaved', () => {
    let clock = recordChange(freshClock(), 1000);
    const serialised = clock.changeCount;
    clock = recordChange(clock, 1500);
    clock = recordSaved(clock, serialised);
    expect(isDirty(clock)).toBe(true);
  });

  it('never moves the saved mark backwards when an older save finishes late', () => {
    let clock = freshClock();
    clock = recordChange(clock, 1);
    clock = recordChange(clock, 2);
    clock = recordSaved(clock, 2);
    clock = recordSaved(clock, 1);
    expect(isDirty(clock)).toBe(false);
  });

  it('treats a freshly loaded project as having nothing unsaved', () => {
    const clock = markPristine(recordChange(freshClock(), 5));
    expect(isDirty(clock)).toBe(false);
    expect(clock.lastChangeAt).toBeNull();
  });

  it('counts only what a project file holds as a change', () => {
    const base: ProjectContent = {
      projectName: 'A',
      bpm: 120,
      timeSignature: [4, 4],
      tracks: [],
      clips: {},
      patterns: [],
      masterVolume: 1,
    };
    expect(contentChanged(base, { ...base })).toBe(false);
    expect(contentChanged(base, { ...base, projectName: 'B' })).toBe(true);
    expect(contentChanged(base, { ...base, bpm: 90 })).toBe(true);
    expect(contentChanged(base, { ...base, tracks: [track] })).toBe(true);
    expect(contentChanged(base, { ...base, clips: {} })).toBe(true); // a new object is a new edit
    expect(contentChanged(base, { ...base, masterVolume: 0.5 })).toBe(true);
  });
});

describe('autosave timing', () => {
  it('does nothing when nothing is unsaved', () => {
    expect(autosaveDecision(freshClock(), 10_000)).toEqual({ kind: 'idle' });
  });

  it('waits out the rest of the idle window, then saves', () => {
    const clock = recordChange(freshClock(), 1000);
    expect(autosaveDecision(clock, 1000)).toEqual({ kind: 'wait', ms: AUTOSAVE_IDLE_MS });
    expect(autosaveDecision(clock, 1000 + 12_000)).toEqual({ kind: 'wait', ms: AUTOSAVE_IDLE_MS - 12_000 });
    expect(autosaveDecision(clock, 1000 + AUTOSAVE_IDLE_MS)).toEqual({ kind: 'save' });
    expect(autosaveDecision(clock, 1000 + AUTOSAVE_IDLE_MS + 5)).toEqual({ kind: 'save' });
  });

  it('is 30 seconds after the LAST change: a newer change pushes the save out', () => {
    expect(AUTOSAVE_IDLE_MS).toBe(30_000);
    let clock = recordChange(freshClock(), 0);
    clock = recordChange(clock, 25_000);
    expect(autosaveDecision(clock, 30_000)).toEqual({ kind: 'wait', ms: 25_000 });
    expect(autosaveDecision(clock, 55_000)).toEqual({ kind: 'save' });
  });

  it('is idle again once the save has landed', () => {
    let clock = recordChange(freshClock(), 0);
    clock = recordSaved(clock, clock.changeCount);
    expect(autosaveDecision(clock, 90_000)).toEqual({ kind: 'idle' });
  });

  it('saves locally on pagehide and warns before unload exactly while changes are unsaved', () => {
    const dirty = recordChange(freshClock(), 0);
    expect(savesOnPageHide(dirty)).toBe(true);
    expect(warnsBeforeUnload(dirty)).toBe(true);
    const clean = recordSaved(dirty, dirty.changeCount);
    expect(savesOnPageHide(clean)).toBe(false);
    expect(warnsBeforeUnload(clean)).toBe(false);
  });
});

describe('saved state', () => {
  it('reads saving, then error, then unsaved, then saved', () => {
    expect(deriveSaveState({ dirty: true, saving: true, failed: true })).toBe('saving');
    expect(deriveSaveState({ dirty: true, saving: false, failed: true })).toBe('error');
    expect(deriveSaveState({ dirty: true, saving: false, failed: false })).toBe('unsaved');
    expect(deriveSaveState({ dirty: false, saving: false, failed: false })).toBe('saved');
  });
});

describe('names', () => {
  it('trims, and refuses empty or over-long names', () => {
    expect(normalizeProjectName('  My song  ')).toBe('My song');
    expect(normalizeProjectName('   ')).toBeNull();
    expect(normalizeProjectName('x'.repeat(80))).toBe('x'.repeat(80));
    expect(normalizeProjectName('x'.repeat(81))).toBeNull();
  });
});

describe('sizes', () => {
  it('shows kilobytes under a megabyte and megabytes above, never zero', () => {
    expect(formatProjectSize(340_000, 'en')).toBe('340 kB');
    expect(formatProjectSize(12, 'en')).toBe('1 kB');
    expect(formatProjectSize(1_250_000, 'en')).toBe('1.3 MB');
  });
});

describe('missing samples', () => {
  it('counts distinct audio samples that are not on this device', () => {
    const clips: Record<string, Clip> = {
      a: audioClip('a', 's1'),
      b: audioClip('b', 's2'),
      c: audioClip('c', 's2'), // same sample twice counts once
      d: audioClip('d', 's3'),
      e: audioClip('e', ''), // no sample yet is not a missing one
    };
    expect(countMissingSamples(clips, new Set(['s3']))).toBe(2);
    expect(countMissingSamples(clips, new Set(['s1', 's2', 's3']))).toBe(0);
    expect(countMissingSamples(clips, new Set())).toBe(3);
  });

  it('ignores clips that are not audio', () => {
    const clips: Record<string, Clip> = {
      m: {
        id: 'm',
        trackId: 't1',
        type: 'midi',
        name: 'm',
        startBeat: 0,
        durationBeats: 4,
        color: '#fff',
        notes: [],
      },
    };
    expect(countMissingSamples(clips, new Set())).toBe(0);
  });
});

describe('account links', () => {
  it('round-trips, replaces and removes links', () => {
    let links = parseCloudLinks(null);
    expect(links).toEqual({});
    links = withLink(links, 'p1', 3);
    links = withLink(links, 'p2', 1);
    links = withLink(links, 'p1', 4);
    expect(parseCloudLinks(JSON.stringify(links))).toEqual({ p1: 4, p2: 1 });
    expect(withoutLink(links, 'p1')).toEqual({ p2: 1 });
    expect(links).toEqual({ p1: 4, p2: 1 }); // not mutated
  });

  it('reads malformed storage as no links', () => {
    expect(parseCloudLinks('{nope')).toEqual({});
    expect(parseCloudLinks('[1,2]')).toEqual({});
    expect(parseCloudLinks('"x"')).toEqual({});
    expect(parseCloudLinks(JSON.stringify({ a: 'x', b: 0, c: 1.5, d: 2 }))).toEqual({ d: 2 });
  });
});

describe('the project schema accepts what the editor produces', () => {
  it('accepts a real newProject() value', () => {
    useStudioStore.getState().newProject();
    const s = useStudioStore.getState();
    const project = buildProject('proj-1', s, 1, 2);
    expect(studioProjectSchema.safeParse(project).success).toBe(true);
    expect(createProjectBody.safeParse({ id: 'proj-1', name: project.name, data: project }).success).toBe(true);
  });

  it('accepts a project with tracks, an audio clip and a pattern, and keeps what it holds', () => {
    const store = useStudioStore.getState();
    store.newProject();
    store.addTrack({ ...track, clipIds: ['a'] });
    store.addClip(audioClip('a', 'sample-1'));
    const s = useStudioStore.getState();
    const project = buildProject('proj-2', s, 1, 2);
    const parsed = studioProjectSchema.safeParse(project);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.tracks).toHaveLength(1);
      expect(Object.keys(parsed.data.clips)).toEqual(['a']);
    }
  });

  it('rejects values outside the ranges the editor works in', () => {
    const ok = buildProject('p', { ...useStudioStore.getState(), projectName: 'X' }, 1, 2);
    expect(studioProjectSchema.safeParse({ ...ok, bpm: 5 }).success).toBe(false);
    expect(studioProjectSchema.safeParse({ ...ok, id: 'has space' }).success).toBe(false);
    expect(studioProjectSchema.safeParse({ ...ok, patterns: 7 }).success).toBe(false);
    expect(studioProjectSchema.safeParse({ ...ok, tracks: [{ ...track, pan: 9 }] }).success).toBe(false);
  });
});
