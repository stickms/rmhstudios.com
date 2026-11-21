import { describe, expect, it } from 'vitest';
import { DEFAULT_LISTEN_PREFS, validateListenPrefs } from '../listen-prefs';

describe('validateListenPrefs', () => {
  it('accepts an offered speed with or without a voice', () => {
    expect(validateListenPrefs({ rate: 1.5, voiceURI: 'v1' })).toEqual({ rate: 1.5, voiceURI: 'v1' });
    expect(validateListenPrefs({ rate: 2 })).toEqual({ rate: 2, voiceURI: null });
  });

  it('rejects a speed the menu does not offer, and non-objects', () => {
    expect(validateListenPrefs({ rate: 3 })).toBeUndefined();
    expect(validateListenPrefs('x')).toBeUndefined();
    expect(validateListenPrefs(null)).toBeUndefined();
    expect(DEFAULT_LISTEN_PREFS).toEqual({ rate: 1, voiceURI: null });
  });
});
