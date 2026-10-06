'use client';

/**
 * Soap bubbles on the desktop wallpaper. Grab one and drag it, fling it and
 * watch it bounce off the others, tap it to pop it; move the cursor (or a
 * finger) near them and they drift out of the way. The physics is
 * `BubbleWorld` in `./frame`.
 *
 * Decorative and `aria-hidden` — the bubbles carry no information — and fully
 * still under reduced motion.
 */

import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from '@/hooks/useReducedMotion';
import { bubbleBurst } from '../fx';
import { sfx } from '../sound';
import { BubbleWorld, type Bubble } from './frame';

const SIZES = [64, 38, 52, 26, 80, 44, 30, 58, 34, 48, 22, 70];

export function BubbleField({ count = 10, big = false }: { count?: number; big?: boolean }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const reduced = prefersReducedMotion();
    const world = new BubbleWorld((b) => {
      sfx.pop();
      const rect = b.el.getBoundingClientRect();
      void bubbleBurst(rect.left + rect.width / 2, rect.top + rect.height / 2);
    });
    const measure = () => world.resize(el.clientWidth, el.clientHeight);
    measure();

    const nodes: HTMLElement[] = [];
    for (let i = 0; i < count; i++) {
      const r = ((SIZES[i % SIZES.length] ?? 40) * (big ? 1.6 : 1)) / 2;
      const node = document.createElement('span');
      node.className = 'ds-os-bubble';
      node.style.width = node.style.height = `${r * 2}px`;
      el.appendChild(node);
      nodes.push(node);
      world.add(node, r);
    }

    const ro = new ResizeObserver(measure);
    ro.observe(el);

    // The cursor/finger position, relative to the field, for the repel force.
    const host = el.parentElement ?? el;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      world.pointer.x = e.clientX - r.left;
      world.pointer.y = e.clientY - r.top;
      world.pointer.active = e.pointerType === 'mouse' || e.buttons > 0 || e.pressure > 0;
    };
    const onLeave = () => {
      world.pointer.active = false;
    };
    host.addEventListener('pointermove', onMove);
    host.addEventListener('pointerleave', onLeave);
    // A lifted finger stops pushing; a mouse keeps hovering.
    const onUpHost = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') onLeave();
    };
    host.addEventListener('pointerup', onUpHost);

    // Grab, drag, throw, or tap to pop.
    const onDown = (e: PointerEvent) => {
      const node = (e.target as HTMLElement).closest<HTMLElement>('.ds-os-bubble');
      if (!node) return;
      const b = world.bubbles.find((x) => x.el === node);
      if (!b || b.popped) return;
      e.preventDefault();
      e.stopPropagation();
      node.setPointerCapture(e.pointerId);
      b.held = true;
      b.vx = b.vy = 0;
      node.classList.add('ds-os-bubble--held');
      const r = el.getBoundingClientRect();
      const grabDx = e.clientX - r.left - b.x;
      const grabDy = e.clientY - r.top - b.y;
      const start = { x: e.clientX, y: e.clientY, t: performance.now() };
      const samples: { x: number; y: number; t: number }[] = [];
      const move = (ev: PointerEvent) => {
        b.x = Math.min(Math.max(ev.clientX - r.left - grabDx, b.r), world.width - b.r);
        b.y = Math.min(Math.max(ev.clientY - r.top - grabDy, b.r), world.height - b.r);
        samples.push({ x: b.x, y: b.y, t: performance.now() });
        if (samples.length > 6) samples.shift();
        if (reduced) node.style.transform = `translate3d(${b.x - b.r}px, ${b.y - b.r}px, 0)`;
      };
      const up = (ev: PointerEvent) => {
        node.releasePointerCapture(ev.pointerId);
        node.removeEventListener('pointermove', move);
        node.removeEventListener('pointerup', up);
        node.removeEventListener('pointercancel', up);
        node.classList.remove('ds-os-bubble--held');
        b.held = false;
        const travelled = Math.hypot(ev.clientX - start.x, ev.clientY - start.y);
        if (travelled < 6 && performance.now() - start.t < 350) {
          world.pop(b as Bubble);
          return;
        }
        const first = samples[0];
        const last = samples[samples.length - 1];
        if (first && last && last.t > first.t) {
          const dt = (last.t - first.t) / 1000;
          b.vx = (last.x - first.x) / dt;
          b.vy = (last.y - first.y) / dt;
        }
      };
      node.addEventListener('pointermove', move);
      node.addEventListener('pointerup', up);
      node.addEventListener('pointercancel', up);
    };
    el.addEventListener('pointerdown', onDown);

    if (!reduced) world.start();
    return () => {
      world.stop();
      ro.disconnect();
      el.removeEventListener('pointerdown', onDown);
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerleave', onLeave);
      host.removeEventListener('pointerup', onUpHost);
      for (const n of nodes) n.remove();
    };
  }, [count, big]);

  return <div ref={root} className="ds-os-bubbles" aria-hidden="true" />;
}
