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
import { planSync, observePosition, refineSeekLead, targetPosition, type PlayerSample } from '@/lib/rmhtube/sync-plan';
import { parseMedia, parseTimestamp, playableUrl, startOffset, withStart, isNativeVideo } from '@/lib/rmhtube/media';
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

  it('does not chase a frame-sized gap while the room is paused, but does not resume half a second off', () => {
    const paused = base({ playing: false, updatedAt: 10_000 });
    expect(at({ state: paused, sample: sample({ position: 100.1 }) }))
      .toMatchObject({ action: 'hold', reason: 'paused' });
    // 0.45 s used to be left standing — and the room resumed with this viewer
    // that far off (two-browser run, 2026-10-11).
    expect(at({ state: paused, sample: sample({ position: 100.45 }) })).toMatchObject({ action: 'seek', to: 100 });
    expect(at({ state: paused, sample: sample({ position: 90 }) })).toMatchObject({ action: 'seek' });
  });

  it('learns a seek cost from how the seek landed, not from tick timing', () => {
    // An instant player that was led by 1.4 s lands 1.4 s ahead: the cost was 0.
    expect(refineSeekLead(1.4, 1.4, 1.4)).toBeCloseTo(0.84, 5);
    expect(refineSeekLead(0, 0, 0)).toBe(0);
    // A player that stalled 0.8 s after an unled seek lands 0.8 s behind.
    expect(refineSeekLead(0, 0, -0.8)).toBeCloseTo(0.8, 5);
    // At 2x the room moves 1.6 s in that 0.8 s.
    expect(refineSeekLead(0, 0, -1.6, 2)).toBeCloseTo(0.8, 5);
    // Converges on the true cost when it keeps being used.
    let lead = 2;
    for (let i = 0; i < 12; i++) lead = refineSeekLead(lead, lead, lead - 0.3);
    expect(lead).toBeCloseTo(0.3, 2);
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

  it('normalises a YouTube link, keeping only the start time (as the shared #t=)', () => {
    const parsed = parseMedia('https://youtu.be/dQw4w9WgXcQ?t=42&si=trackingjunk');
    expect(parsed?.url).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ#t=42');
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

describe('start offsets', () => {
  // "Start at 1:30" used to reach only the player (YouTube's ?t=), so the
  // leader began at 1:30 while the room's anchor — and every viewer — said 0.
  // It is now the item's first anchor; these pin the parsing that feeds it.
  it('reads every common timestamp form', () => {
    expect(parseTimestamp('90')).toBe(90);
    expect(parseTimestamp('90.5')).toBe(90.5);
    expect(parseTimestamp('90s')).toBe(90);
    expect(parseTimestamp('1m30s')).toBe(90);
    expect(parseTimestamp('1h2m3s')).toBe(3723);
    expect(parseTimestamp('1:30')).toBe(90);
    expect(parseTimestamp('01:02:03')).toBe(3723);
    expect(parseTimestamp('npt:12')).toBe(12);
    expect(parseTimestamp('10,20')).toBe(10);
    for (const bad of ['', 'abc', '1:2:3:4', '0', '-5', 'm', 'NaN']) expect(parseTimestamp(bad), bad).toBeNull();
  });

  it('carries the start on every provider as #t= and strips it from what the player gets', () => {
    const cases: Array<[string, number]> = [
      ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s', 90],
      ['https://www.youtube.com/embed/dQw4w9WgXcQ?start=45', 45],
      ['https://www.twitch.tv/videos/123456789?t=1h0m5s', 3605],
      ['https://vimeo.com/123456789#t=30s', 30],
      ['https://cdn.example.com/movie.mp4#t=12.5', 12.5],
      ['https://cdn.example.com/movie.mp4#t=10,20', 10],
    ];
    for (const [raw, start] of cases) {
      const media = parseMedia(raw)!;
      expect(startOffset(media.url), raw).toBe(start);
      const play = playableUrl(media.url);
      expect(startOffset(play), raw).toBe(0);
      expect(play, raw).not.toMatch(/[?&#]t=|start=/);
    }
  });

  it('reads the legacy ?t= on YouTube items queued before #t= existed', () => {
    const legacy = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42';
    expect(startOffset(legacy)).toBe(42);
    expect(playableUrl(legacy)).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });

  it('never touches a non-YouTube query (a signed URL can have its own t=)', () => {
    const signed = 'https://cdn.example.com/v.mp4?t=abc123&sig=xyz';
    expect(startOffset(signed)).toBe(0);
    expect(playableUrl(signed)).toBe(signed);
  });

  it('keeps the engine hint beside a start offset', () => {
    const hinted = withStart('https://cdn.example.com/live/playlist#.m3u8', 30);
    expect(startOffset(hinted)).toBe(30);
    expect(playableUrl(hinted)).toBe('https://cdn.example.com/live/playlist#.m3u8');
    expect(isNativeVideo('direct', hinted)).toBe(false);
    expect(isNativeVideo('direct', 'https://cdn.example.com/movie.mp4#t=30')).toBe(true);
  });

  it('ignores a start on a live broadcast', () => {
    expect(startOffset(parseMedia('https://www.twitch.tv/somestreamer?t=30')!.url)).toBe(0);
  });
});
