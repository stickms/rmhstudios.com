import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Steel M6: a skeleton is a still `--site-bg-subtle` block. No pulse, no shimmer, no sweep. It holds the shape of the
 * content that replaces it so nothing shifts when the content arrives.
 */
function Skeleton({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        'rounded-site-sm bg-site-bg-subtle',
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
