// The run log crosses the wire gzipped. The hub decodes attacker-controlled bytes, so the decoder must
// refuse a gzip bomb, oversize and garbage rather than inflate them.
import {
  describe,
  it,
  expect,
} from 'vitest';
import { gzipSync } from 'node:zlib';
import {
  encodeRunLog,
  MAX_ENCODED_LOG_CHARS,
} from '../log-codec';
import {
  decodeRunLog,
  MAX_INFLATED_BYTES,
} from '../log-codec.server';
import { RunRecorder } from '../run-log';

describe('run log codec', () => {
  it('round-trips a log through gzip + base64', async () => {
    const rec =
      new RunRecorder(
        [
          {
            id: 'a',
            classId:
              'knight',
            slot: 0,
          },
        ],
      );
    for (
      let t = 0;
      t <
      600;
      t += 3
    )
      rec.input(
        t,
        'a',
        (t %
          200) -
          100,
        0,
      );
    const log =
      rec.toLog(
        600,
        99,
        false,
      );
    const enc =
      await encodeRunLog(
        log,
      );
    expect(
      enc?.enc,
    ).toBe(
      'gzip-b64',
    );
    expect(
      decodeRunLog(
        enc,
      ),
    ).toEqual(
      log,
    );
  });

  it('refuses a gzip bomb (inflates past the cap)', () => {
    const bomb =
      gzipSync(
        Buffer.alloc(
          MAX_INFLATED_BYTES *
            4,
          48,
        ),
      ).toString(
        'base64',
      );
    expect(
      bomb.length,
    ).toBeLessThan(
      MAX_ENCODED_LOG_CHARS,
    ); // it is small on the wire...
    expect(
      decodeRunLog(
        {
          enc: 'gzip-b64',
          data: bomb,
        },
      ),
    ).toBeNull(); // ...and refused on the way out
  });

  it('refuses oversize, garbage and unknown encodings', () => {
    expect(
      decodeRunLog(
        {
          enc: 'json',
          data: 'x'.repeat(
            MAX_ENCODED_LOG_CHARS +
              1,
          ),
        },
      ),
    ).toBeNull();
    expect(
      decodeRunLog(
        {
          enc: 'gzip-b64',
          data: 'not gzip at all',
        },
      ),
    ).toBeNull();
    expect(
      decodeRunLog(
        {
          enc: 'json',
          data: '{broken',
        },
      ),
    ).toBeNull();
    expect(
      decodeRunLog(
        {
          enc: 'brotli',
          data: 'e30=',
        },
      ),
    ).toBeNull();
    expect(
      decodeRunLog(
        null,
      ),
    ).toBeNull();
    expect(
      decodeRunLog(
        'string',
      ),
    ).toBeNull();
  });
});
