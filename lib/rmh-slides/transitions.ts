import type { TransitionType } from '@/components/rmh-slides/types';

export interface TransitionDefinition {
  name: TransitionType;
  label: string;
  keyframes: string;
  duration: number; // ms
}

export const transitions: TransitionDefinition[] = [
  {
    name: 'none',
    label: 'None',
    keyframes: '',
    duration: 0,
  },
  {
    name: 'fade',
    label: 'Fade',
    keyframes: `
      @keyframes slide-fade-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }
    `,
    duration: 400,
  },
  {
    name: 'slide-left',
    label: 'Slide Left',
    keyframes: `
      @keyframes slide-slide-left-in {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `,
    duration: 500,
  },
  {
    name: 'slide-right',
    label: 'Slide Right',
    keyframes: `
      @keyframes slide-slide-right-in {
        from { transform: translateX(-100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `,
    duration: 500,
  },
  {
    name: 'slide-up',
    label: 'Slide Up',
    keyframes: `
      @keyframes slide-slide-up-in {
        from { transform: translateY(100%); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
    `,
    duration: 500,
  },
  {
    name: 'zoom',
    label: 'Zoom',
    keyframes: `
      @keyframes slide-zoom-in {
        from { transform: scale(0.5); opacity: 0; }
        to { transform: scale(1); opacity: 1; }
      }
    `,
    duration: 400,
  },
];

export function getTransition(name: TransitionType): TransitionDefinition {
  return transitions.find((t) => t.name === name) || transitions[0];
}

export function getTransitionAnimation(name: TransitionType): string {
  if (name === 'none') return 'none';
  const t = getTransition(name);
  const animName = `slide-${name}-in`;
  return `${animName} ${t.duration}ms ease-out forwards`;
}

export function getAllKeyframes(): string {
  return transitions
    .filter((t) => t.keyframes)
    .map((t) => t.keyframes)
    .join('\n');
}
