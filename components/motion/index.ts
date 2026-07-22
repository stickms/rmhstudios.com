/**
 * components/motion — shared motion primitives for the Apple-style UI overhaul.
 * Import everything motion-related from here.
 */
export {
  EASE_OUT_EXPO,
  DUR_FAST,
  DUR_BASE,
  DUR_SLOW,
  STAGGER,
  STAGGER_SLOW,
  fadeRise,
  fadeIn,
  scaleIn,
} from './motionTokens';

export { Reveal } from './Reveal';
export type { RevealProps } from './Reveal';

export { RevealGroup, RevealItem } from './RevealGroup';
export type { RevealGroupProps, RevealItemProps } from './RevealGroup';

export { AsyncReveal } from './AsyncReveal';
export type { AsyncRevealProps } from './AsyncReveal';

export { ScrollScene, useScrollScene } from './ScrollScene';
export type { ScrollSceneProps } from './ScrollScene';

export { useScrollProgress } from './useScrollProgress';
export type { ScrollProgress } from './useScrollProgress';
