import { describe, expect, it } from 'vitest';
import { nativeViewTransitionsAllowed } from '../view-transition';

describe('native view-transition safety', () => {
  it('keeps WebKit on plain, non-freezing navigation', () => {
    const safariIos =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
    const safariMac =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
    const chromeIos =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1';

    expect(nativeViewTransitionsAllowed(safariIos)).toBe(false);
    expect(nativeViewTransitionsAllowed(safariMac)).toBe(false);
    expect(nativeViewTransitionsAllowed(chromeIos)).toBe(false);
  });

  it('retains native transitions on engines with the escape hatch', () => {
    const chrome =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
    const firefox =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0';

    expect(nativeViewTransitionsAllowed(chrome)).toBe(true);
    expect(nativeViewTransitionsAllowed(firefox)).toBe(true);
  });
});
