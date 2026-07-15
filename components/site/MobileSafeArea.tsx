'use client';

import { useEffect, useState } from 'react';

/**
 * Marks <html> with `is-ios` on iOS devices so globals.css can add iOS Safari's
 * bottom-toolbar height (100lvh−100dvh) to `--safe-bottom`. That toolbar — the
 * iOS 26 floating tab bar — covers position:fixed bottom UI (the mobile dock,
 * FAB, mini-player) and is not reported by env(safe-area-inset-*). Gating on iOS
 * keeps Android's TOP url bar (which also shrinks dvh) from lifting the dock.
 *
 * With `?safedebug` in the URL it also renders a small live readout of the
 * viewport metrics, so the real values can be captured on a device we can't
 * emulate here. It's inert (returns null) otherwise.
 */
export function MobileSafeArea() {
  const [debug, setDebug] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent || '';
    const isIOS =
      /iP(hone|od|ad)/.test(ua) ||
      // iPadOS 13+ reports as desktop Safari; fall back to touch-point sniffing.
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const root = document.documentElement;
    if (isIOS) root.classList.add('is-ios');
    // Read the raw query so route-level validateSearch can't strip the flag.
    setDebug(new URLSearchParams(window.location.search).has('safedebug'));
    return () => root.classList.remove('is-ios');
  }, []);

  return debug ? <SafeAreaDebug /> : null;
}

function SafeAreaDebug() {
  const [rows, setRows] = useState<[string, string][]>([]);

  useEffect(() => {
    const probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;pointer-events:none;';
    document.body.appendChild(probe);
    const px = (h: string) => {
      probe.style.height = h;
      return Math.round(probe.getBoundingClientRect().height);
    };

    const update = () => {
      const vv = window.visualViewport;
      setRows([
        ['is-ios', String(document.documentElement.classList.contains('is-ios'))],
        ['100lvh', `${px('100lvh')}px`],
        ['100dvh', `${px('100dvh')}px`],
        ['100svh', `${px('100svh')}px`],
        ['lvh−dvh (toolbar)', `${px('100lvh') - px('100dvh')}px`],
        ['env(sa-inset-bottom)', `${px('env(safe-area-inset-bottom,0px)')}px`],
        ['--browser-bottom-bar', `${px('var(--browser-bottom-bar)')}px`],
        ['--safe-bottom', `${px('var(--safe-bottom)')}px`],
        ['innerHeight', `${window.innerHeight}px`],
        ['visualViewport.h', vv ? `${Math.round(vv.height)}px` : 'n/a'],
        ['visualViewport.offTop', vv ? `${Math.round(vv.offsetTop)}px` : 'n/a'],
      ]);
    };

    update();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('orientationchange', update);
    return () => {
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('scroll', update);
      window.removeEventListener('orientationchange', update);
      probe.remove();
    };
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top, 0px) + 8px)',
        left: 8,
        zIndex: 2147483647,
        font: '11px/1.35 ui-monospace, Menlo, monospace',
        color: '#eaf2ff',
        background: 'rgba(6,14,28,.9)',
        border: '1px solid rgba(255,255,255,.22)',
        borderRadius: 10,
        padding: '8px 10px',
        maxWidth: '62vw',
        pointerEvents: 'none',
        boxShadow: '0 8px 28px rgba(0,0,0,.5)',
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 4, letterSpacing: '.02em' }}>safe-area debug</div>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ opacity: 0.75 }}>{k}</span>
          <span>{v}</span>
        </div>
      ))}
    </div>
  );
}
