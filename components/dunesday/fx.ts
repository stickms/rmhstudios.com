'use client';

/**
 * One-shot visual feedback: soap-bubble bursts and water ripples.
 *
 * Everything here runs on a discrete event (a click, a tick-off) and ends on
 * its own. Nothing follows the pointer — the site retired cursor-tracking
 * effects on 2026-08-01 (design-language.md §5.1.1) — and nothing runs a frame
 * loop of ours: the burst is canvas-confetti, which owns its own short-lived
 * animation and tears its canvas down when the particles land.
 */

import { prefersReducedMotion } from '@/hooks/useReducedMotion';

const BUBBLE_COLORS = ['#bff3ff', '#7fd8ff', '#ffffff', '#a8f07a', '#d9f6ff'];

/** A burst of glassy soap bubbles from a point on screen (client px). */
export async function bubbleBurst(x: number, y: number, big = false): Promise<void> {
  if (typeof window === 'undefined' || prefersReducedMotion()) return;
  try {
    const confetti = (await import('canvas-confetti')).default;
    const origin = { x: x / window.innerWidth, y: y / window.innerHeight };
    confetti({
      particleCount: big ? 90 : 28,
      spread: big ? 110 : 70,
      startVelocity: big ? 38 : 22,
      gravity: -0.35,
      drift: 0.2,
      decay: 0.93,
      ticks: big ? 220 : 140,
      scalar: big ? 1.6 : 1.2,
      shapes: ['circle'],
      colors: BUBBLE_COLORS,
      origin,
      zIndex: 60,
      disableForReducedMotion: true,
    });
  } catch {
    // Pure delight — never let it break the action that triggered it.
  }
}

/** A water ripple from the click point inside an element. */
export function ripple(el: HTMLElement, clientX: number, clientY: number): void {
  if (prefersReducedMotion()) return;
  const rect = el.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) * 2;
  const dot = document.createElement('span');
  dot.className = 'ds-ripple';
  dot.setAttribute('aria-hidden', 'true');
  dot.style.width = dot.style.height = `${size}px`;
  dot.style.left = `${clientX - rect.left - size / 2}px`;
  dot.style.top = `${clientY - rect.top - size / 2}px`;
  el.appendChild(dot);
  dot.addEventListener('animationend', () => dot.remove(), { once: true });
  // Belt and braces for engines that skip animationend on hidden tabs.
  window.setTimeout(() => dot.remove(), 900);
}
