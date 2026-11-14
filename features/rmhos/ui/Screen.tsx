/**
 * Screen: the `div > (div + canvas)` structure v86 requires, scaled to fit by CSS. A click gives
 * the box keyboard focus, which is when v86's keyboard and mouse adapters start sending input.
 */
import { forwardRef } from 'react';

const Screen = forwardRef<HTMLDivElement, { label: string }>(function Screen({ label }, ref) {
  return (
    <div
      ref={ref}
      className="rmhos-screen"
      tabIndex={0}
      role="application"
      aria-label={label}
      onPointerDown={(e) => e.currentTarget.focus()}
    >
      <div />
      <canvas />
    </div>
  );
});

export default Screen;
