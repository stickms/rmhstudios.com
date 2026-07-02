'use client';

import { Link, useNavigate } from '@tanstack/react-router';
import type { ComponentProps } from 'react';
import { runViewTransition } from '@/lib/view-transition';

type LinkComponentProps = ComponentProps<typeof Link>;

/**
 * Drop-in replacement for TanStack `<Link>` that runs the navigation inside a
 * scoped View Transition, so an element tagged with a matching
 * `view-transition-name` on both pages morphs across the navigation (e.g. an
 * album cover growing into the fullscreen viewer).
 *
 * It only intercepts plain left-clicks — modified clicks (⌘/ctrl/shift/middle,
 * `target="_blank"`) fall through to normal anchor behaviour so "open in new
 * tab" still works, and the underlying `<Link>` keeps its hover-prefetch and
 * accessibility. Degrades to a normal navigation when the browser lacks the API
 * or the user prefers reduced motion (handled inside `runViewTransition`).
 */
export function ViewTransitionLink(props: LinkComponentProps) {
  const navigate = useNavigate();
  const { onClick, target } = props;

  return (
    <Link
      {...props}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented) return;
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        if (target && target !== '_self') return;
        e.preventDefault(); // stop Link's own navigation; we drive it in the transition
        runViewTransition(() =>
          // Forward the destination verbatim; navigate's options are a superset
          // of Link's `to`/`params`/`search`.
          navigate({ to: props.to, params: props.params, search: props.search } as never)
        );
      }}
    />
  );
}
