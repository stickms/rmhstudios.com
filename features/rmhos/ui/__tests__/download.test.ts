import {
  describe,
  expect,
  it,
} from 'vitest';
import { copyFileName } from '../download';

describe('copyFileName', () => {
  it('names each stored copy', () => {
    expect(
      copyFileName(
        'current',
        false,
      ),
    ).toBe(
      'rmhos-home.tar.gz',
    );
    expect(
      copyFileName(
        'replaced',
        false,
      ),
    ).toBe(
      'rmhos-home-replaced.tar.gz',
    );
    expect(
      copyFileName(
        'damaged',
        false,
      ),
    ).toBe(
      'rmhos-home-damaged.gz',
    );
  });
  it('an unreadable current archive downloads under the damaged name, never as a backup', () => {
    expect(
      copyFileName(
        'current',
        true,
      ),
    ).toBe(
      'rmhos-home-damaged.gz',
    );
    expect(
      copyFileName(
        'replaced',
        true,
      ),
    ).toBe(
      'rmhos-home-replaced.tar.gz',
    );
  });
});
