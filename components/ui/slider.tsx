import * as React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';

import { cn } from '@/lib/utils';

/**
 * Steel K7: track 2px in `--site-border`, thumb a real 22 x 10px pill (`rounded-full` = 5px), hit area 44px high (A3). The
 * thumb is chrome per section 4.1 (flat grey until approached, pressed or focused). The Radix Thumb itself is the
 * chrome element: `data-chrome="pill"` for the renderer (section 4.3 V4), `.chrome-thumb` for the gradient. The root is
 * the `.chrome-host` that owns `--c` and the 20px proximity zone (app/styles/steel-chrome.css).
 */
function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledby,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  const _values = React.useMemo(
    () => (Array.isArray(value) ? value : Array.isArray(defaultValue) ? defaultValue : [min, max]),
    [value, defaultValue, min, max],
  );

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn(
        'chrome-host flex h-11 w-full touch-none items-center select-none data-disabled:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-11 data-[orientation=vertical]:flex-col',
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="bg-site-border relative grow data-[orientation=horizontal]:h-0.5 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-0.5"
      />
      {Array.from({ length: _values.length }, (_, index) => (
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          data-chrome="pill"
          // Radix names the role=slider thumb, not the root: hand the caller's label down to it.
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledby}
          key={index}
          className="chrome-thumb block h-2.5 w-[22px] shrink-0 rounded-full disabled:pointer-events-none disabled:opacity-50"
        />
      ))}
    </SliderPrimitive.Root>
  );
}

export { Slider };
