import type { ReactNode } from 'react';

/**
 * A member's `@handle`, direction-isolated. Printed bare inside a right-to-left
 * page, the bidirectional algorithm moves the `@` to the end (`playerone@`);
 * `<bdi>` makes the handle its own run, so the `@` stays first in every locale.
 * Renders no strings of its own and adds no classes: the parent sets the type.
 */
export function Handle({ handle }: { handle: ReactNode }) {
  return <bdi>@{handle}</bdi>;
}
