import type {
  ComponentPropsWithoutRef,
  ComponentPropsWithRef,
  ElementType,
  ReactNode,
} from 'react';
import { cn } from '@/lib/utils';
import './spine.css';

/**
 * The spine (Steel section 7): the system's one structural signature. A 1px line down the inline-start side of a
 * content column; items hang on it with a dot and section headings ("stations") with a hollow dot.
 *
 * Pure markup and CSS (P1): there are no hooks and no effects in this file, and nothing is measured. In RTL locales the
 * line moves to the right because every offset is a logical property (P5). What the spine means on each page is fixed by
 * the recipes in section 10 (P4); one spine per column, and the only nested spine is the replies to a reply (P2).
 *
 * ```tsx
 * <Spine role="feed" aria-label="Feed">
 *   <SpineItem as="article">…a post…</SpineItem>
 *   <SpineItem dot={false}>…a form…</SpineItem>
 * </Spine>
 * ```
 */
export function Spine({
  children,
  className,
  ...props
}: {
  children: ReactNode;
  className?: string;
} & Omit<
  ComponentPropsWithoutRef<'div'>,
  | 'children'
  | 'className'
>) {
  return (
    <div
      className={cn(
        'spine',
        className,
      )}
      {...props}
    >
      {
        children
      }
    </div>
  );
}

type SpineItemTag =
  | 'div'
  | 'article'
  | 'section';

export type SpineItemProps<
  T extends
    SpineItemTag =
    'div',
> =
  {
    /** A discrete item (a post, a row, a message from someone else) has a dot; running prose and forms do not (P3). */
    dot?: boolean;
    /** The element: `article` for a post (so a `role="feed"` spine is a real feed), `div` otherwise. */
    as?: T;
  } & Omit<
    ComponentPropsWithRef<T>,
    'as'
  >;

export function SpineItem<
  T extends
    SpineItemTag =
    'div',
>({
  dot = true,
  as,
  className,
  ...props
}: SpineItemProps<T>) {
  const Tag =
    (as ??
      'div') as ElementType;
  return (
    <Tag
      className={cn(
        'spine-item',
        className,
      )}
      data-dot={
        dot
          ? undefined
          : 'false'
      }
      {...props}
    />
  );
}

/**
 * A section heading on the spine, with a hollow dot. It renders a real `<h2>` so the page outline is correct for screen
 * readers (the page's `<h1>` is its title).
 */
export function SpineStation({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={cn(
        'spine-station t-label',
        className,
      )}
    >
      {
        children
      }
    </h2>
  );
}
