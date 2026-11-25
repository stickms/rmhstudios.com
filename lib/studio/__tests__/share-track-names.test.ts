/**
 * A shared Studio snapshot names no file: an audio track's name (often the sample's file name) is emptied like an audio
 * clip's, MIDI track names stay, and the opener's copy labels an unnamed audio track "Audio track N" (S11-07).
 */
import { describe, expect, it } from 'vitest';
import { studioProjectSchema } from '@/lib/studio/project-schema';
import { copyFromShare, sanitizeForShare } from '@/lib/studio/share';
import type { Project, Track } from '@/lib/studio/types';

const FILE_NAME = 'my-secret-kick-sample.wav';

const track = (id: string, type: Track['type'], name: string, clipIds: string[] = []): Track => ({
  id,
  name,
  type,
  color: '#ffffff',
  volume: 0.8,
  pan: 0,
  muted: false,
  soloed: false,
  armed: false,
  clipIds,
  pluginChain: [],
  sends: [],
  height: 80,
});

function fixture(): Project {
  return {
    id: 'proj-1',
    name: 'Beat tape',
    bpm: 120,
    timeSignature: [4, 4],
    tracks: [
      track('t1', 'audio', FILE_NAME, ['a1']),
      track('t2', 'midi', 'Bassline'),
      track('t3', 'audio', 'Vocal take 2'),
      track('t4', 'automation', 'Filter'),
    ],
    clips: {
      a1: {
        id: 'a1',
        trackId: 't1',
        type: 'audio',
        name: FILE_NAME,
        startBeat: 0,
        durationBeats: 4,
        color: '#ff0000',
        bufferId: 'buffer-1',
        sampleOffset: 0,
        fadeInBeats: 0,
        fadeOutBeats: 0,
      },
    },
    patterns: [],
    masterVolume: 1,
    createdAt: 1,
    updatedAt: 2,
  };
}

const names = (p: { tracks: { name: string }[] }) => p.tracks.map((t) => t.name);
const ids = () => {
  let n = 0;
  return () => `id-${++n}`;
};

describe('sanitizeForShare and track names', () => {
  it('empties every audio track name and keeps the MIDI and automation names', () => {
    const { project } = sanitizeForShare(fixture());
    expect(names(project)).toEqual(['', 'Bassline', '', 'Filter']);
  });

  it('leaves no sample file name anywhere in the serialised copy', () => {
    const text = JSON.stringify(sanitizeForShare(fixture()).project);
    expect(text).not.toContain(FILE_NAME);
    expect(text).not.toContain('Vocal take');
  });

  it('does not change the original and still produces a project the schema accepts', () => {
    const original = fixture();
    const { project } = sanitizeForShare(original);
    expect(names(original)).toEqual([FILE_NAME, 'Bassline', 'Vocal take 2', 'Filter']);
    expect(studioProjectSchema.safeParse(project).success).toBe(true);
  });

  it('copes with a project that has no tracks field', () => {
    expect(sanitizeForShare({ clips: {} }).project).toEqual({ clips: {} });
  });
});

describe('copyFromShare and unnamed audio tracks', () => {
  it('labels unnamed audio tracks "Audio track N" in order, and keeps every other name', () => {
    const shared = sanitizeForShare(fixture()).project;
    const copy = copyFromShare(shared, { mintId: ids() });
    expect(names(copy)).toEqual(['Audio track 1', 'Bassline', 'Audio track 2', 'Filter']);
  });

  it('takes the label from the caller, so it can be translated', () => {
    const shared = sanitizeForShare(fixture()).project;
    const copy = copyFromShare(shared, { mintId: ids(), audioTrackName: (n) => `Spur ${n}` });
    expect(names(copy)).toEqual(['Spur 1', 'Bassline', 'Spur 2', 'Filter']);
  });

  it('leaves a snapshot shared before this change, with named audio tracks, as it is', () => {
    const copy = copyFromShare(fixture(), { mintId: ids() });
    expect(names(copy)).toEqual([FILE_NAME, 'Bassline', 'Vocal take 2', 'Filter']);
  });
});
