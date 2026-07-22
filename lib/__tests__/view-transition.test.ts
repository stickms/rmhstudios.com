import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  nativeViewTransitionsAllowed,
  recoverViewTransition,
  runLiquidOpen,
} from '../view-transition';

afterEach(() => {
  recoverViewTransition();
  vi.unstubAllGlobals();
});

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

describe('view-transition recovery', () => {
  it('skips a wedged snapshot and restores its temporary source name', () => {
    const classes = new Set<string>();
    const skipTransition = vi.fn();
    const documentElement = {
      classList: {
        add: (...names: string[]) => names.forEach((name) => classes.add(name)),
        remove: (...names: string[]) => names.forEach((name) => classes.delete(name)),
      },
    };
    const documentMock = {
      documentElement,
      startViewTransition: (update: () => void | Promise<void>) => {
        void update();
        return { finished: new Promise<void>(() => {}), skipTransition };
      },
    };
    vi.stubGlobal('document', documentMock);
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    });
    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: false }),
    });

    const source = { style: { viewTransitionName: 'before' } } as HTMLElement;
    runLiquidOpen(source, 'liquid-book-example', () => {});

    expect(source.style.viewTransitionName).toBe('liquid-book-example');
    expect(classes.has('vt-active')).toBe(true);

    recoverViewTransition();

    expect(skipTransition).toHaveBeenCalledOnce();
    expect(source.style.viewTransitionName).toBe('before');
    expect(classes.has('vt-active')).toBe(false);
    expect(classes.has('vt-liquid')).toBe(false);
  });
});
