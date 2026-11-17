/**
 * The pinned scroll scene, as markup (the styling is each microsite's own).
 *
 * A scene is a tall section whose inner frame pins to the viewport while scroll
 * runs a registered `--p` from 0 to 1 across it; its steps are stacked and each
 * owns a window `--a`…`--b` (percent of the pinned span) in which it is live.
 * All of the motion is CSS on a view timeline, so there is no script here and no
 * frame loop: this file only writes the class names and the inline custom
 * properties the stylesheet reads. Without a scroll timeline (or with motion
 * off) the same markup is an ordinary stacked section.
 *
 * Shared by RMH PMC (`components/rmh-pmc/rmh-pmc.css`) and RMH Research
 * (`components/rmh-research/rmh-research.css`). Keyboard focus inside a step
 * that is not live is handled by `hooks/useSceneFocus.ts`.
 */
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

/** A CSS custom property in a `style` prop, without a cast at every call site. */
export function cssVars(vars: Record<`--${string}`, string | number>, base?: CSSProperties): CSSProperties {
  return { ...base, ...vars } as CSSProperties;
}

/** Steps tile the pinned span: spacing and window `s`/`w` are 100/n, `w2` is half a window (a step's centre). */
export function sceneGeometry(n: number) {
  const s = 100 / n;
  return { s, w: s, w2: s / 2 };
}
const r2 = (x: number) => Math.round(x * 100) / 100;
/** `--a`/`--b` (percent of the pin) for step `i` of `n`. */
export function stepWindow(i: number, n: number) {
  const { s, w } = sceneGeometry(n);
  return { a: r2(i * s), b: r2(i * s + w) };
}

/**
 * A pinned scene. `len` is the scroll length in viewports, `steps` the number of
 * steps (it feeds the step windows and any step readout). `pinClassName` styles
 * the sticky frame.
 */
export function Scene({
  len,
  steps = 1,
  className = '',
  pinClassName = '',
  id,
  children,
  ...rest
}: {
  len: number;
  steps?: number;
  className?: string;
  pinClassName?: string;
  id?: string;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLElement>, 'className' | 'children' | 'id'>) {
  const g = sceneGeometry(steps);
  return (
    <section
      id={id}
      className={`scene ${className}`.trim()}
      style={cssVars({ '--len': len, '--n': steps, '--s': r2(g.s), '--w2': r2(g.w2) })}
      {...rest}
    >
      <div className={`scene-pin ${pinClassName}`.trim()}>{children}</div>
    </section>
  );
}

/** One step of a scene (`.sc-step`, marked `data-step` for keyboard focus). */
export function Step({
  index,
  count,
  className = '',
  children,
  ...rest
}: {
  index: number;
  count: number;
  className?: string;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'children'>) {
  const { a, b } = stepWindow(index, count);
  const pos = index === 0 ? ' is-first' : index === count - 1 ? ' is-last' : '';
  return (
    <div className={`sc-step${pos} ${className}`.trim()} data-step="" style={cssVars({ '--a': a, '--b': b })} {...rest}>
      {children}
    </div>
  );
}

/** Progress dots: one per step, lit while that step is live. */
export function SceneDots({ count, className = '' }: { count: number; className?: string }) {
  return (
    <div className={`scene-dots ${className}`.trim()} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => {
        const { a, b } = stepWindow(i, count);
        const pos = i === 0 ? ' is-first' : i === count - 1 ? ' is-last' : '';
        return <i key={i} className={`sc-dot${pos}`} style={cssVars({ '--a': a, '--b': b })} />;
      })}
    </div>
  );
}
