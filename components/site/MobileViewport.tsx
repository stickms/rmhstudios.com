'use client';

import { useEffect, useState } from 'react';

/**
 * Temporary on-device diagnostic for the mobile document-scroll work. Renders
 * ONLY when the URL contains `?safedebug`, so it's inert in normal use. Reports
 * the viewport units and — importantly — `window.scrollY` and `100dvh`: as you
 * scroll the document, iOS Safari minimizes its bottom bar, so `100dvh` should
 * grow toward `100lvh`. That, plus content reaching the red line at the very
 * bottom, confirms the fix.
 */
export function MobileViewport() {
  const [show, setShow] = useState(false);
  const [rows, setRows] = useState<[string, string][]>([]);

  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('safedebug')) return;
    setShow(true);

    const probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;pointer-events:none;';
    document.body.appendChild(probe);
    const px = (h: string) => {
      probe.style.height = h;
      return Math.round(probe.getBoundingClientRect().height);
    };

    const update = () => {
      const doc = document.documentElement;
      setRows([
        ['100lvh', `${px('100lvh')}px`],
        ['100dvh', `${px('100dvh')}px`],
        ['100svh', `${px('100svh')}px`],
        ['innerHeight', `${window.innerHeight}px`],
        ['screen.height', `${window.screen?.height ?? '?'}px`],
        ['window.scrollY', `${Math.round(window.scrollY)}px`],
        ['doc.scrollHeight', `${doc.scrollHeight}px`],
        ['env(sa-bottom)', `${px('env(safe-area-inset-bottom,0px)')}px`],
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

  if (!show) return null;

  return (
    <>
      <div
        aria-hidden
        style={{ position: 'fixed', left: 0, right: 0, bottom: 0, height: 3, background: '#ff3b3b', zIndex: 2147483646, pointerEvents: 'none' }}
      />
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
          maxWidth: '66vw',
          pointerEvents: 'none',
          boxShadow: '0 8px 28px rgba(0,0,0,.5)',
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 4 }}>viewport debug</div>
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ opacity: 0.75 }}>{k}</span>
            <span>{v}</span>
          </div>
        ))}
        <div style={{ marginTop: 4, opacity: 0.6 }}>scroll down → 100dvh should grow</div>
      </div>
    </>
  );
}
