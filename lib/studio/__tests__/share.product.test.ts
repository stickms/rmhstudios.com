import { describe, expect, it } from 'vitest';
import { studioProjectSchema } from '@/lib/studio/project-schema';
import {
  copyFromShare,
  countAudioClips,
  extractShareParam,
  sanitizeForShare,
  SHARE_TOKEN_PATTERN,
  SHARED_PROJECT_ID,
  withoutShareParam,
} from '@/lib/studio/share';
import type { Clip, Project } from '@/lib/studio/types';

const SAMPLE_ID = '5c0f3a9e-7d1b-4c52-9a3e-0b1f6d2e8a41';
const SAMPLE_NAME = 'my-secret-kick-sample.wav';

function fixture(): Project {
  const track = (id: string, type: 'audio' | 'midi', clipIds: string[]) => ({
    id,
    name: `Track ${id}`,
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
  const base = { startBeat: 0, durationBeats: 4, color: '#ff0000' };
  const clips: Record<string, Clip> = {
    a1: {
      ...base,
      id: 'a1',
      trackId: 't1',
      type: 'audio',
      name: SAMPLE_NAME,
      bufferId: SAMPLE_ID,
      sampleOffset: 0,
      fadeInBeats: 0,
      fadeOutBeats: 0,
    },
    a2: {
      ...base,
      id: 'a2',
      trackId: 't1',
      type: 'audio',
      name: 'Vocal',
      bufferId: '',
      sampleOffset: 0,
      fadeInBeats: 0,
      fadeOutBeats: 0,
    },
    m1: {
      ...base,
      id: 'm1',
      trackId: 't2',
      type: 'midi',
      name: 'Bassline',
      notes: [{ id: 'n1', pitch: 40, startBeat: 0, durationBeats: 1, velocity: 100 }],
    },
    p1: { ...base, id: 'p1', trackId: 't2', type: 'pattern', name: 'Drums', patternId: 'pat1' },
  };
  return {
    id: 'proj-1',
    name: 'Beat tape',
    bpm: 120,
    timeSignature: [4, 4],
    tracks: [track('t1', 'audio', ['a1', 'a2']), track('t2', 'midi', ['m1', 'p1'])],
    clips,
    patterns: [
      {
        id: 'pat1',
        name: 'Drums',
        lengthBeats: 4,
        stepsPerBeat: 4,
        tracks: [{ instrumentId: 'kick', steps: [{ active: true, velocity: 100 }] }],
      },
    ],
    masterVolume: 1,
    createdAt: 1,
    updatedAt: 2,
  };
}

describe('sanitizeForShare', () => {
  it('empties every audio clip bufferId and name and counts them', () => {
    const { project, missingSamples } = sanitizeForShare(fixture());
    expect(missingSamples).toBe(2);
    for (const key of ['a1', 'a2']) {
      const clip = project.clips[key]!;
      expect(clip.type).toBe('audio');
      expect(clip).toMatchObject({ bufferId: '', name: '' });
    }
  });

  it('leaves MIDI and pattern clips untouched', () => {
    const original = fixture();
    const { project } = sanitizeForShare(original);
    expect(project.clips.m1).toEqual(original.clips.m1);
    expect(project.clips.p1).toEqual(original.clips.p1);
    // Only the audio track's name changes (S11-07); the MIDI track is as it was.
    expect(project.tracks).toEqual([{ ...original.tracks[0]!, name: '' }, original.tracks[1]]);
    expect(project.patterns).toEqual(original.patterns);
  });

  it('keeps the audio clips in place (position, length) so they stay on the timeline', () => {
    const { project } = sanitizeForShare(fixture());
    expect(project.clips.a1).toMatchObject({ trackId: 't1', startBeat: 0, durationBeats: 4 });
    expect(project.tracks[0]!.clipIds).toEqual(['a1', 'a2']);
  });

  it('replaces the account project id, which is never shared', () => {
    const { project } = sanitizeForShare(fixture());
    expect(project.id).toBe(SHARED_PROJECT_ID);
    expect(JSON.stringify(project)).not.toContain('proj-1');
  });

  it('does not change its input', () => {
    const original = fixture();
    sanitizeForShare(original);
    expect(original.clips.a1).toMatchObject({ bufferId: SAMPLE_ID, name: SAMPLE_NAME });
  });

  it('leaves no device sample id or sample file name anywhere in the serialised copy', () => {
    const text = JSON.stringify(sanitizeForShare(fixture()).project);
    expect(text).not.toContain(SAMPLE_ID);
    expect(text).not.toContain(SAMPLE_NAME);
    expect(text).not.toContain('Vocal');
  });

  it('produces a project the project schema accepts', () => {
    const parsed = studioProjectSchema.safeParse(sanitizeForShare(fixture()).project);
    expect(parsed.success).toBe(true);
  });

  it('counts an already empty audio clip too, and none for a project without audio', () => {
    expect(countAudioClips(fixture().clips)).toBe(2);
    expect(sanitizeForShare({ clips: { m: { type: 'midi' } } }).missingSamples).toBe(0);
  });
});

describe('copyFromShare', () => {
  const ids = () => {
    let n = 0;
    return () => `fresh-${++n}`;
  };

  it('mints a fresh project id, track ids and clip ids, and keeps every reference consistent', () => {
    const shared = sanitizeForShare(fixture()).project;
    const copy = copyFromShare(shared, { mintId: ids(), now: 99 });
    expect(copy.id).not.toBe(shared.id);
    expect(copy.createdAt).toBe(99);
    const oldIds = [...shared.tracks.map((t) => t.id), ...Object.keys(shared.clips)];
    const newIds = [...copy.tracks.map((t) => t.id), ...Object.keys(copy.clips)];
    expect(newIds.some((id) => oldIds.includes(id))).toBe(false);
    expect(new Set([...newIds, copy.id]).size).toBe(newIds.length + 1);
    for (const track of copy.tracks) {
      for (const clipId of track.clipIds) {
        expect(copy.clips[clipId]).toBeDefined();
        expect(copy.clips[clipId]!.id).toBe(clipId);
        expect(copy.clips[clipId]!.trackId).toBe(track.id);
      }
    }
    expect(Object.keys(copy.clips)).toHaveLength(Object.keys(shared.clips).length);
  });

  it('keeps patterns and the pattern clip reference, and names the copy as asked', () => {
    const copy = copyFromShare(sanitizeForShare(fixture()).project, { name: 'My version', mintId: ids() });
    expect(copy.name).toBe('My version');
    expect(copy.patterns).toHaveLength(1);
    const pattern = Object.values(copy.clips).find((c) => c.type === 'pattern');
    expect(pattern).toMatchObject({ patternId: 'pat1' });
  });

  it('does not change the shared data, and the copy is schema-valid', () => {
    const shared = sanitizeForShare(fixture()).project;
    const before = JSON.stringify(shared);
    const copy = copyFromShare(shared);
    expect(JSON.stringify(shared)).toBe(before);
    expect(studioProjectSchema.safeParse(copy).success).toBe(true);
  });
});

describe('the share address', () => {
  it('reads ?share= and drops it, keeping other parameters and the hash', () => {
    expect(extractShareParam('?share=abc')).toBe('abc');
    expect(extractShareParam('?other=1')).toBeNull();
    expect(extractShareParam('?share=')).toBeNull();
    expect(extractShareParam(`?share=${'x'.repeat(65)}`)).toBeNull();
    expect(withoutShareParam('https://rmhstudios.com/studio?share=abc&x=1#top')).toBe('/studio?x=1#top');
    expect(withoutShareParam('/studio?share=abc')).toBe('/studio');
  });

  it('a token is 22 base64url characters', () => {
    expect(SHARE_TOKEN_PATTERN.test('A'.repeat(22))).toBe(true);
    expect(SHARE_TOKEN_PATTERN.test('A'.repeat(21))).toBe(false);
    expect(SHARE_TOKEN_PATTERN.test(`${'A'.repeat(21)}+`)).toBe(false);
  });
});
