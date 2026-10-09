'use client';

import * as React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';

import { cn } from '@/lib/utils';

function Slider({
 className,
 defaultValue,
 value,
 min = 0,
 max = 100,
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
 'relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col',
 className,
 )}
 {...props}
 >
 <SliderPrimitive.Track
 data-slot="slider-track"
 className={cn(
 // Track = a flush hairline of the theme's border ink (no inner shadow:
 // the field tier is a fill, never a deboss); range = accent liquid in it.
 'bg-site-border relative grow overflow-hidden rounded-full data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5',
 )}
 >
 <SliderPrimitive.Range
 data-slot="slider-range"
 className={cn(
 'bg-site-accent absolute data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full',
 )}
 />
 </SliderPrimitive.Track>
 {Array.from({ length: _values.length }, (_, index) => (
 <SliderPrimitive.Thumb
 data-slot="slider-thumb"
 key={index}
 className="relative block size-4 shrink-0 rounded-full border border-site-border bg-site-surface-opaque shadow-site-sm transition-[box-shadow,scale] after:absolute after:-inset-3.5 after:content-[''] hover:scale-110 disabled:pointer-events-none disabled:opacity-50"
 />
 ))}
 </SliderPrimitive.Root>
 );
}

export { Slider };
