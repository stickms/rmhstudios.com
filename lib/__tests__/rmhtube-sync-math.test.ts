/**
 * The pure core of RmhTube's watch-together sync.
 *
 * These three modules are where the room's correctness lives, and each covers a
 * defect that shipped: the timeline ran away from a buffering leader, the
 * correction policy fed itself through the player's own `seeked` events, and
 * the URL parser accepted links the player could not load.
 */

import { describe, it, expect } from 'vitest';
import { extrapolate, reanchor, isNewerAnchor, initialVideoState } from '@/lib/rmhtube/sync-math';
import { planSync, observePosition, targetPosition, type PlayerSample } from '@/lib/rmhtube/sync-plan';
import { parseMedia } from '@/lib/rmhtube/media';
import type { VideoState } from '@/lib/rmhtube/types';

const base = (over: Partial<VideoState> = {}): VideoState => ({
  mode: 'vod',
  playing: true,
  currentTime: 100,
  playbackRate: 1,
  updatedAt: 10_000,
  stalled: false,
  rev: 1,
  ...over,
});

const sample = (over: Partial<PlayerSample> = {}): PlayerSample => ({
  position: 100,
  paused: false,
  ended: false,
  ready: true,
  buffering: false,
  rate: 1,
  seekableStart: null,
  seekableEnd: null,
  ...over,
});

describe('extrapolate', () => {
  it('advances by elapsed wall-clock while playing', () => {
    expect(extrapolate(base(), 15_000)).toBeCloseTo(105, 5);
  });

  it('scales by playback rate', () => {
    expect(extrapolate(base({ playbackRate: 2 }), 15_000)).toBeCloseTo(110, 5);
  });

  it('does not advance while paused', () => {
    expect(extrapolate(base({ playing: false }), 999_999)).toBe(100);
  });

  it('holds while the leader is stalled', () => {
    // Wall-clock time is not evidence the media moved. Projecting through a
    // leader's rebuffer ran the whole room past the person it was following,
    // and the leader's next report yanked everyone back.
    expect(extrapolate(base({ stalled: true }), 20_000)).toBe(100);
  });

  it('never projects a live source', () => {
    // A broadcast's position is a sliding window, not a shared timeline.
    expect(extrapolate(base({ mode: 'live' }), 999_999)).toBe(100);
  });

  it('never goes backwards if serverNow precedes updatedAt (clock skew)', () => {
    expect(extrapolate(base(), 9_000)).toBe(100);
  });
});

describe('reanchor', () => {
  it('moves currentTime to the effective position and re-stamps updatedAt', () => {
    const r = reanchor(base(), 15_000);
    expect(r.currentTime).toBeCloseTo(105, 5);
    expect(r.updatedAt).toBe(15_000);
    expect(r.playing).toBe(true);
  });

  it('is idempotent in value for a paused state', () => {
    const r = reanchor(base({ playing: false }), 20_000);
    expect(r.currentTime).toBe(100);
    expect(r.updatedAt).toBe(20_000);
  });
});

describe('isNewerAnchor', () => {
  it('accepts anything when there is no current anchor', () => {
    expect(isNewerAnchor(null, base())).toBe(true);
  });

  it('rejects an anchor that arrives after a newer one', () => {
    expect(isNewerAnchor(base({ rev: 5 }), base({ rev: 4 }))).toBe(false);
  });

  it('falls back to the stamp when revisions match', () => {
    expect(isNewerAnchor(base({ rev: 5, updatedAt: 20_000 }), base({ rev: 5, updatedAt: 10_000 }))).toBe(false);
    expect(isNewerAnchor(base({ rev: 5, updatedAt: 10_000 }), base({ rev: 5, updatedAt: 20_000 }))).toBe(true);
  });
});

describe('initialVideoState', () => {
  it('starts paused at the origin, in the mode the item calls for', () => {
    expect(initialVideoState(500)).toMatchObject({ mode: 'vod', playing: false, currentTime: 0 });
    expect(initialVideoState(500, 'live').mode).toBe('live');
  });
});

describe('targetPosition', () => {
  it('clamps to what the player can actually reach', () => {
    // A DVR window or a partly-loaded source makes the room's position
    // unreachable; seeking outside it is answered with a stall, not a seek.
    const state = base({ currentTime: 500, updatedAt: 10_000 });
    expect(targetPosition(state, 10_000, sample({ seekableEnd: 120 }))).toBe(120);
    expect(targetPosition(state, 10_000, sample({ seekableStart: 900 }))).toBe(900);
  });
});

describe('planSync', () => {
  const at = (over: Partial<Parameters<typeof planSync>[0]> = {}) =>
    planSync({
      state: base({ updatedAt: 10_000 }),
      serverNow: 10_000,
      sample: sample(),
      canCorrect: true,
      canNudge: true,
      force: false,
      ...over,
    });

  it('holds when the source is live, whatever the position says', () => {
    const plan = at({ state: base({ mode: 'live', currentTime: 0 }), sample: sample({ position: 9_999 }) });
    expect(plan).toMatchObject({ action: 'hold', reason: 'live' });
  });

  it('holds while corrections are suspended or the player is not ready', () => {
    expect(at({ canCorrect: false })).toMatchObject({ action: 'hold', reason: 'suspended' });
    expect(at({ sample: sample({ ready: false }) })).toMatchObject({ action: 'hold', reason: 'not-ready' });
  });

  it('reports settled inside the soft band', () => {
    const plan = at({ sample: sample({ position: 100.2 }) });
    expect(plan).toMatchObject({ action: 'settled', rate: 1 });
  });

  it('nudges the rate in the mid band, in the direction that closes the gap', () => {
    expect(at({ sample: sample({ position: 99 }) })).toMatchObject({ action: 'rate' });
    // Behind the room → run slightly fast.
    expect((at({ sample: sample({ position: 99 }) }) as { rate: number }).rate).toBeGreaterThan(1);
    // Ahead of the room → run slightly slow.
    expect((at({ sample: sample({ position: 101 }) }) as { rate: number }).rate).toBeLessThan(1);
  });

  it('tolerates the mid band where the provider has no usable rate control', () => {
    // YouTube and Twitch expose a few discrete steps, so a ±5% nudge is either
    // ignored or snapped to 1.25× — an audible lurch to close half a second.
    expect(at({ sample: sample({ position: 99 }), canNudge: false }))
      .toMatchObject({ action: 'hold', reason: 'coarse-rate' });
  });

  it('seeks past the hard tolerance', () => {
    const plan = at({ sample: sample({ position: 50 }) });
    expect(plan).toMatchObject({ action: 'seek' });
    expect((plan as { to: number }).to).toBeCloseTo(100, 5);
  });

  it('never seeks forward into a stall', () => {
    // This was the stutter loop: buffering froze the position, the timeline ran
    // on, the gap crossed the threshold, and the seek dropped whatever had
    // buffered — so the stall restarted one seek deeper.
    expect(at({ sample: sample({ position: 50, buffering: true }) }))
      .toMatchObject({ action: 'hold', reason: 'buffering' });
    // Being AHEAD while buffering is not the same trap; that one is correctable.
    expect(at({ sample: sample({ position: 150, buffering: true }) })).toMatchObject({ action: 'seek' });
  });

  it('still realigns a buffering player when forced', () => {
    expect(at({ sample: sample({ position: 50, buffering: true }), force: true }))
      .toMatchObject({ action: 'seek' });
  });

  it('leaves a finished element alone', () => {
    expect(at({ sample: sample({ ended: true, position: 50 }) }))
      .toMatchObject({ action: 'hold', reason: 'ended' });
  });

  it('does not chase a frame-sized gap while the room is paused', () => {
    const paused = base({ playing: false, updatedAt: 10_000 });
    expect(at({ state: paused, sample: sample({ position: 100.3 }) }))
      .toMatchObject({ action: 'hold', reason: 'paused' });
    expect(at({ state: paused, sample: sample({ position: 90 }) })).toMatchObject({ action: 'seek' });
  });
});

describe('observePosition', () => {
  it('reads ordinary playback as neither a jump nor a stall', () => {
    const o = observePosition(10, 10.25, 250, 1, true, 0.75);
    expect(o.jumped).toBe(false);
    expect(o.stalled).toBe(false);
  });

  it('accounts for the playback rate', () => {
    // 250 ms at 2× is half a second of media — playback, not a seek.
    expect(observePosition(10, 10.5, 250, 2, true, 0.75).jumped).toBe(false);
  });

  it('reads a scrub as a jump', () => {
    expect(observePosition(10, 90, 250, 1, true, 0.75).jumped).toBe(true);
    expect(observePosition(90, 10, 250, 1, true, 0.75).jumped).toBe(true);
  });

  it('reads a frozen playhead as a stall while playing', () => {
    const o = observePosition(10, 10, 250, 1, true, 0.75);
    expect(o.stalled).toBe(true);
  });

  it('does not call a paused player stalled', () => {
    expect(observePosition(10, 10, 250, 1, false, 0.75).stalled).toBe(false);
  });

  it('absorbs one tick of timer jitter', () => {
    // The tolerance exists so a late tick is not mistaken for a seek — which is
    // how the providers' own synthesised `seeked` events go wrong.
    expect(observePosition(10, 10.7, 250, 1, true, 0.75).jumped).toBe(false);
  });
});

describe('parseMedia', () => {
  it('understands every YouTube address, including the ones that got no id', () => {
    const id = 'dQw4w9WgXcQ';
    for (const url of [
      `https://www.youtube.com/watch?v=${id}`,
      `https://youtu.be/${id}`,
      `https://m.youtube.com/watch?v=${id}&list=PL123`,
      `https://music.youtube.com/watch?v=${id}`,
      `https://www.youtube.com/embed/${id}`,
      `https://www.youtube.com/shorts/${id}`,
      `https://www.youtube.com/live/${id}`,
    ]) {
      expect(parseMedia(url), url).toMatchObject({ mediaType: 'youtube', id });
    }
  });

  it('marks a /live/ link as live and a /watch link as not', () => {
    // Only a hint either way — the same URL is an ordinary VOD once the stream
    // ends, and a broadcast is equally reachable at /watch?v=. The player has
    // the final say.
    expect(parseMedia('https://www.youtube.com/live/dQw4w9WgXcQ')?.liveHint).toBe('live');
    expect(parseMedia('https://www.youtube.com/watch?v=dQw4w9WgXcQ')?.liveHint).toBe('vod');
  });

  it('normalises a YouTube link, keeping only the start time', () => {
    const parsed = parseMedia('https://youtu.be/dQw4w9WgXcQ?t=42&si=trackingjunk');
    expect(parsed?.url).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42');
  });

  it('rejects YouTube pages that are not videos', () => {
    // The old detector returned 'youtube' for all of these, so they entered the
    // queue and rendered an empty player.
    expect(parseMedia('https://www.youtube.com/@someChannel')).toBeNull();
    expect(parseMedia('https://www.youtube.com/results?search_query=cats')).toBeNull();
    expect(parseMedia('https://www.youtube.com/feed/subscriptions')).toBeNull();
    expect(parseMedia('https://www.youtube.com/watch?v=tooshort')).toBeNull();
  });

  it('separates a Twitch channel from a Twitch VOD', () => {
    expect(parseMedia('https://twitch.tv/somestreamer')).toMatchObject({
      mediaType: 'twitch',
      liveHint: 'live',
      id: 'somestreamer',
    });
    expect(parseMedia('https://www.twitch.tv/videos/123456789')).toMatchObject({
      mediaType: 'twitch',
      liveHint: 'vod',
    });
  });

  it('rejects Twitch clips, which the player cannot embed', () => {
    // `*.twitch.tv` used to be accepted wholesale, so a clip passed validation
    // and then loaded nothing.
    expect(parseMedia('https://clips.twitch.tv/SomeClipSlug')).toBeNull();
    expect(parseMedia('https://www.twitch.tv/somestreamer/clip/SomeClipSlug')).toBeNull();
  });

  it('accepts direct media and adaptive manifests', () => {
    expect(parseMedia('https://example.com/video.mp4')).toMatchObject({ mediaType: 'direct', liveHint: 'vod' });
    // A manifest is live about as often as not, and only the manifest knows.
    expect(parseMedia('https://example.com/stream.m3u8')?.liveHint).toBe('unknown');
    expect(parseMedia('https://example.com/stream.mpd')?.liveHint).toBe('unknown');
  });

  it('accepts Vimeo', () => {
    expect(parseMedia('https://vimeo.com/123456789')).toMatchObject({ mediaType: 'vimeo', id: '123456789' });
  });

  it('refuses anything that is not http(s)', () => {
    // These reach an iframe or a `<video src>`, so the scheme check is the
    // boundary, not a formality.
    expect(parseMedia('javascript:alert(1)')).toBeNull();
    expect(parseMedia('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(parseMedia('not a url at all')).toBeNull();
  });
});
