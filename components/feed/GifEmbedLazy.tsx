import {
  lazy,
  type ComponentProps,
} from 'react';
import { ArrivalSuspense } from '@/components/ui/arrive';

/**
 * `GifEmbed` for the feed's rows, loaded only when a post has a GIF.
 *
 * Every row used to import it statically, so the home page's critical path carried it
 * whether or not a single post on the page had a GIF (low-bandwidth audit,
 * 2026-11-18). Lazy, the server still renders the GIF in full and hydration keeps
 * that markup while the code arrives. Only a client navigation that reaches a GIF
 * before the chunk has loaded sees the fallback: the same block GifEmbed itself
 * draws while a Tenor GIF resolves, after which the GIF fades in (M9).
 */
const GifEmbedInner =
  lazy(
    () =>
      import('./GifEmbed').then(
        (
          m,
        ) => ({
          default:
            m.GifEmbed,
        }),
      ),
  );

export function GifEmbed(
  props: ComponentProps<
    typeof GifEmbedInner
  >,
) {
  return (
    <ArrivalSuspense
      fallback={
        <div
          className={`rounded-site overflow-hidden ${props.className ?? ''}`}
        >
          <div className="w-full h-48 bg-site-bg-subtle" />
        </div>
      }
    >
      <GifEmbedInner
        {...props}
      />
    </ArrivalSuspense>
  );
}
