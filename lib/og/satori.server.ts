import { isValidElement, type ReactNode } from 'react';
import renderSvg, { type SatoriOptions } from 'satori';

/**
 * The one way to call satori. Every OG card, the Discord activity images and
 * the PWA icons go through here, never `import satori from 'satori'`.
 *
 * Why it exists: satori up to 0.35 laid out every element as
 * `box-sizing: border-box` (a `width` included its padding and border). Its
 * Yoga 3 layout (0.38+) follows CSS and defaults to `content-box`, so every
 * padded box grew by its padding and each card rendered shifted and cropped.
 * The cards are written for border-box, so this sets it on every element that
 * does not choose a box-sizing itself, and the cards keep their layout.
 *
 * A function component is called here, as satori would call it (they are
 * plain functions of their props, without hooks), so its output is covered too.
 */
export function withBorderBox(node: ReactNode): ReactNode {
  if (Array.isArray(node)) return node.map(withBorderBox);
  if (!isValidElement(node)) return node;
  if (typeof node.type === 'function') {
    return withBorderBox((node.type as (props: unknown) => ReactNode)(node.props));
  }
  const props = node.props as {
    style?: Record<string, unknown>;
    children?: ReactNode;
  };
  const style =
    props.style && 'boxSizing' in props.style
      ? props.style
      : {
          boxSizing: 'border-box',
          ...props.style,
        };
  const children = props.children === undefined ? undefined : withBorderBox(props.children);
  return {
    ...node,
    props: {
      ...props,
      style,
      ...(children === undefined
        ? {}
        : {
            children,
          }),
    },
  } as ReactNode;
}

export default function satori(node: ReactNode, options: SatoriOptions): Promise<string> {
  return renderSvg(withBorderBox(node), options);
}
