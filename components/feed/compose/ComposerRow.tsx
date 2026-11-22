import { useEffect, type ComponentProps, type ReactNode, type RefObject } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/ui/UserAvatar';

/**
 * The home composer's one look (owner, 2026-11-13: "I don't like how the three buttons menu changes the look of the
 * compose box"): a 28px avatar, a borderless field that grows with its text, whatever the post carries (pictures, a
 * poll, an option's chip), then one row of quick actions with Post at its end.
 *
 * It is drawn twice with the same parts, which is what makes the swap between them invisible: by `HomeComposer`, which
 * is on the home page's critical path and holds only a plain field and buttons, and by `ComposeBox` in its `row`
 * variant, the lazy chunk that carries uploads, the pickers and the menus. Everything here is therefore small and
 * imports nothing heavy.
 */
export function ComposerRow({
  image,
  name,
  field,
  children,
  tools,
  post,
  footer,
  ...root
}: {
  image: string | null;
  name: string | null;
  /** The text field: a `<textarea>` carrying `COMPOSER_FIELD_CLASS`. */
  field: ReactNode;
  /** What the post carries, between the field and the quick actions. Renders nothing while it is empty. */
  children?: ReactNode;
  /** The quick actions, in order: picture, GIF, poll, AI, three dots. */
  tools: ReactNode;
  /** The primary button at the inline end of the quick actions. */
  post: ReactNode;
  /** Notices that hang under the row (a stored draft, "saved"), so they never move the row itself. */
  footer?: ReactNode;
} & Omit<ComponentProps<'div'>, 'children' | 'className'>) {
  return (
    <div className="relative flex flex-col gap-1" {...root}>
      <div className="home-composer__row home-composer__row--field">
        <UserAvatar src={image} alt="" size={28} fallbackName={name ?? undefined} />
        <div className="min-w-0 flex-1">{field}</div>
      </div>
      <div className="min-w-0 ps-10 empty:hidden">{children}</div>
      <div className="flex items-center ps-8">
        <div className="flex min-w-0 flex-1 items-center">{tools}</div>
        {post}
      </div>
      {footer}
    </div>
  );
}

/** The field's classes: no border, no fill, one 36px line that grows (`.home-composer__field`, feed.css). */
export const COMPOSER_FIELD_CLASS =
  'home-composer__field field-bare block w-full border-0 bg-transparent px-0 py-1.5 text-base leading-6 text-site-text placeholder:text-site-text-muted sm:text-sm';

/**
 * The field grows with its text through `field-sizing: content` (feed.css). Where an engine lacks that, the height is
 * set from the content here instead; where it has it, this does nothing.
 */
export function useComposerFieldGrow(ref: RefObject<HTMLTextAreaElement | null>, value: string) {
  useEffect(() => {
    const el = ref.current;
    if (!el || (typeof CSS !== 'undefined' && CSS.supports?.('field-sizing', 'content'))) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [ref, value]);
}

/** Where the caret was, and whether the field had focus, when the light row handed over to the full composer. */
export interface ComposerFieldHandoff {
  focused: boolean;
  start: number;
  end: number;
}

/** What the row was expanded for: the popover or editor the full composer opens as it mounts. */
export type ComposerOpen = 'menu' | 'gif' | 'poll' | 'ai';

/** One quick action: a ghost icon button named by its label, which is also its tooltip. */
export function ComposerTool({
  icon: Icon,
  label,
  ...props
}: { icon: LucideIcon; label: string } & Omit<
  ComponentProps<typeof Button>,
  'children' | 'variant' | 'size' | 'aria-label' | 'title'
>) {
  return (
    <Button type="button" variant="ghost" size="icon" aria-label={label} title={label} {...props}>
      <Icon aria-hidden />
    </Button>
  );
}
