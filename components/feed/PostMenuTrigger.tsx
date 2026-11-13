import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { MoreHorizontal } from 'lucide-react';

interface PostMenuTriggerProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** The accessible name, and the hover title: "Post actions", "More options". */
  label: string;
  /** Whether the menu it opens is showing. */
  open: boolean;
}

/**
 * The three dots that open a post's or a reply's menu (owner, 2026-11-13: "add a 'three dots' menu to posts on the
 * main feed, and change 'more' to use those dots as well"). One trigger for the feed row, the post card, the post
 * page and a reply, so the four cannot drift apart.
 *
 * It is drawn as a 16px glyph in the action row's ink and keeps a 44px hit area through `.feed-action`'s `::after`
 * (feed.css), so it can sit on a line of text without making the line taller.
 */
export const PostMenuTrigger = forwardRef<HTMLButtonElement, PostMenuTriggerProps>(
  function PostMenuTrigger({ label, open, className, ...props }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className={className ? `feed-action feed-action--icon ${className}` : 'feed-action feed-action--icon'}
        {...props}
      >
        <MoreHorizontal className="feed-action__icon" aria-hidden />
      </button>
    );
  },
);
