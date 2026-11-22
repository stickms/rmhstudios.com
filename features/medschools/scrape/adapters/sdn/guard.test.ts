import { describe, expect, it, vi } from 'vitest';
import type { PoliteClient } from '../../http';
import { SdnPageError, assertPage, isCloudflareChallenge } from './guard';
import { readFixture } from './test-fixtures';

const session = () =>
  ({
    noteFailure: vi.fn(),
  }) as unknown as PoliteClient & {
    noteFailure: ReturnType<typeof vi.fn>;
  };

describe('SDN guard', () => {
  it('a 200 page with challenge text is a challenge', () => {
    expect(
      isCloudflareChallenge({
        status: 200,
        body: readFixture('thread-challenge.html'),
      }),
    ).toBe(true);
  });
  it('403 with challenge markup is a challenge', () => {
    expect(
      isCloudflareChallenge({
        status: 403,
        body: '<html><title>Just a moment...</title></html>',
      }),
    ).toBe(true);
  });
  it('the cf-mitigated header is a challenge', () => {
    expect(
      isCloudflareChallenge({
        status: 403,
        body: '',
        headers: {
          'cf-mitigated': 'challenge',
        },
      }),
    ).toBe(true);
  });
  it('a normal page is not, even with the beacon path or a post saying just a moment', () => {
    const page = readFixture('thread-small-p1.html');
    const withBeacon = page + '<script src="/cdn-cgi/challenge-platform/h/g/scripts/jsd/main.js"></script>';
    expect(
      isCloudflareChallenge({
        status: 200,
        body: withBeacon,
      }),
    ).toBe(false);
    expect(
      isCloudflareChallenge({
        status: 200,
        body: '<article class="message--post">Just a moment, thanks</article>',
      }),
    ).toBe(false);
  });
  it('assertPage counts a challenge as a failure on the session and throws', () => {
    const s = session();
    expect(() =>
      assertPage(
        {
          ok: true,
          status: 200,
          body: readFixture('thread-challenge.html'),
        },
        s,
        'thread',
      ),
    ).toThrow(SdnPageError);
    expect(s.noteFailure).toHaveBeenCalledTimes(1);
  });
  it('assertPage throws on a bad status without counting it again (the host already did) and returns the body of a good page', () => {
    const s = session();
    expect(() =>
      assertPage(
        {
          ok: false,
          status: 500,
          body: '',
        },
        s,
        'x',
      ),
    ).toThrow(SdnPageError);
    expect(s.noteFailure).not.toHaveBeenCalled();
    expect(
      assertPage(
        {
          ok: true,
          status: 200,
          body: 'fine',
        },
        s,
        'x',
      ),
    ).toBe('fine');
  });
  it('assertPage on 404 throws with status 404 and does not call noteFailure', () => {
    const s = session();
    try {
      assertPage(
        {
          ok: false,
          status: 404,
          body: '',
        },
        s,
        'x',
      );
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(SdnPageError);
      expect((e as SdnPageError).status).toBe(404);
    }
    expect(s.noteFailure).not.toHaveBeenCalled();
  });
});
