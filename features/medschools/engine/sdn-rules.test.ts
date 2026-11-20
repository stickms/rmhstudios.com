import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  containsHandle,
  redactForModel,
} from './sdn-rules';

describe('sdn-rules', () => {
  it('redacts emails, urls, mentions and page handles', () => {
    const out =
      redactForModel(
        'mail a.b@x.org see https://x.org/p?q=1 @bob_1, and Alice-77 said hi',
        [
          'alice-77',
        ],
      );
    expect(
      out,
    ).toBe(
      'mail [email] see [link] [user], and [user] said hi',
    );
  });
  it('matches handles on word boundaries only', () => {
    expect(
      redactForModel(
        'mikey went',
        [
          'mike',
        ],
      ),
    ).toBe(
      'mikey went',
    );
    expect(
      containsHandle(
        'thanks MIKE!',
        [
          'mike',
        ],
      ),
    ).toBe(
      true,
    );
    expect(
      containsHandle(
        'mikey',
        [
          'mike',
        ],
      ),
    ).toBe(
      false,
    );
  });
  it('ignores handles too short to match safely', () => {
    expect(
      redactForModel(
        'jo is a name',
        [
          'jo',
        ],
      ),
    ).toBe(
      'jo is a name',
    );
  });
});
