'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportClientError } from '@/lib/client-errors';

interface Props {
  children: ReactNode;
  /** Telemetry label — becomes the client-error `source` (e.g. 'shell-overlays'). */
  label?: string;
  /** Rendered in place of the children after a caught error. Defaults to null. */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Fault-isolation boundary for NON-CRITICAL UI — shell overlays, promo modals,
 * background widgets, the mini-player.
 *
 * A throw anywhere in the subtree is caught, reported to the client-error
 * beacon (`reportClientError`, rate-limited + de-duped), and swallowed so the
 * surrounding page keeps working. Without it, such a throw bubbles to the
 * route-level `errorComponent` and blanks the ENTIRE shell — turning a bug in a
 * dismissible promo modal into a whole-page crash.
 *
 * Only wrap subtrees where losing the content silently is acceptable. Primary
 * page content must still surface a real error (the route errorComponent), not
 * disappear — don't use this to hide failures that the user needs to see.
 */
export class SilentErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportClientError(error, {
      source: `silent-boundary:${this.props.label ?? 'unknown'}`,
      componentStack: info.componentStack ?? undefined,
    });
  }

  render() {
    if (this.state.hasError) return this.props.fallback ?? null;
    return this.props.children;
  }
}
