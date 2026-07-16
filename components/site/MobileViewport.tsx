'use client';

import { useEffect, useState } from 'react';

/**
 * Temporary on-device diagnostic (`?safedebug` only, inert otherwise).
 *
 * Purpose: figure out — definitively — where iOS 26 Safari actually paints a
 * `position: fixed` element relative to the notch (top safe area) and its
 * floating bottom bar. Every fix so far edited fixed layers and had no visual
 * effect, which means fixed is being confined away from those edges. These
 * vivid markers make one screenshot answer the question:
 *
 *  • CYAN dashed rectangle = the bounds of a plain `fixed inset:0` box. If its
 *    top edge sits BELOW the notch, or its bottom edge sits ABOVE Safari's bar,
 *    then fixed can't reach that edge (and only the root background / in-flow
 *    content can paint there).
 *  • RED band  = top safe area  (`fixed top:0`, height env(safe-area-inset-top)).
 *  • GREEN band = bottom safe area (`fixed bottom:0`, height env(...-bottom)).
 *  • MAGENTA left bar  = `fixed top:0; height: calc(100lvh + 25vh)` — how far my
 *    aurora overshoot actually reaches (does it go behind Safari's bar or stop?).
 *  • ORANGE right bar  = `fixed top:0; height: 100dvh`.
 *
 * Take one screenshot at the very top of the feed, and (if easy) one scrolled
 * down a bit. That's all I need to target the correct layer.
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
        ['env(sa-top)', `${px('env(safe-area-inset-top,0px)')}px`],
        ['env(sa-bottom)', `${px('env(safe-area-inset-bottom,0px)')}px`],
        ['100lvh', `${px('100lvh')}px`],
        ['100dvh', `${px('100dvh')}px`],
        ['100svh', `${px('100svh')}px`],
        ['innerHeight', `${window.innerHeight}px`],
        ['screen.height', `${window.screen?.height ?? '?'}px`],
        ['scrollY', `${Math.round(window.scrollY)}px`],
        ['scrollHeight', `${doc.scrollHeight}px`],
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

  const Z = 2147483000;
  const noHit = { pointerEvents: 'none' as const };
  const label: React.CSSProperties = {
    ...noHit,
    position: 'fixed',
    font: '700 10px/1 ui-monospace, Menlo, monospace',
    color: '#001018',
    padding: '2px 4px',
    borderRadius: 4,
    zIndex: Z + 30,
  };

  return (
    <>
      {/* Bounds of a plain `fixed inset:0` box — the whole area fixed can occupy. */}
      <div aria-hidden style={{ ...noHit, position: 'fixed', inset: 0, outline: '3px dashed #00e5ff', outlineOffset: '-3px', background: 'rgba(0,229,255,0.08)', zIndex: Z + 10 }} />

      {/* MAGENTA (left): fixed top:0 height calc(100lvh + 25vh) — my aurora overshoot. */}
      <div aria-hidden style={{ ...noHit, position: 'fixed', top: 0, left: 0, width: 10, height: 'calc(100lvh + 25vh)', background: 'magenta', opacity: 0.85, zIndex: Z + 20 }} />
      {/* ORANGE (right): fixed top:0 height 100dvh. */}
      <div aria-hidden style={{ ...noHit, position: 'fixed', top: 0, right: 0, width: 10, height: '100dvh', background: 'orange', opacity: 0.85, zIndex: Z + 20 }} />

      {/* RED band = top safe area (fixed top:0). GREEN band = bottom safe area (fixed bottom:0). */}
      <div aria-hidden style={{ ...noHit, position: 'fixed', top: 0, left: 0, right: 0, height: 'env(safe-area-inset-top, 0px)', background: 'rgba(255,45,45,0.5)', zIndex: Z + 20 }} />
      <div aria-hidden style={{ ...noHit, position: 'fixed', top: 0, left: 0, right: 0, height: 3, background: '#ff2d2d', zIndex: Z + 21 }} />
      <div aria-hidden style={{ ...noHit, position: 'fixed', bottom: 0, left: 0, right: 0, height: 'env(safe-area-inset-bottom, 0px)', background: 'rgba(45,255,90,0.5)', zIndex: Z + 20 }} />
      <div aria-hidden style={{ ...noHit, position: 'fixed', bottom: 0, left: 0, right: 0, height: 3, background: '#2dff5a', zIndex: Z + 21 }} />

      {/* Edge labels. */}
      <span style={{ ...label, top: 'calc(env(safe-area-inset-top, 0px) + 6px)', right: 8, background: '#00e5ff' }}>fixed top:0</span>
      <span style={{ ...label, bottom: 'calc(env(safe-area-inset-bottom, 0px) + 6px)', right: 8, background: '#2dff5a' }}>fixed bottom:0</span>

      {/* Readout. */}
      <div
        style={{
          ...noHit,
          position: 'fixed',
          top: 'calc(env(safe-area-inset-top, 0px) + 40px)',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: Z + 40,
          font: '11px/1.35 ui-monospace, Menlo, monospace',
          color: '#eaf2ff',
          background: 'rgba(6,14,28,.92)',
          border: '1px solid rgba(255,255,255,.28)',
          borderRadius: 10,
          padding: '8px 10px',
          minWidth: 190,
          boxShadow: '0 8px 28px rgba(0,0,0,.6)',
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 4 }}>viewport debug</div>
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 14 }}>
            <span style={{ opacity: 0.75 }}>{k}</span>
            <span>{v}</span>
          </div>
        ))}
      </div>
    </>
  );
}
