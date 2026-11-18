import ReactMarkdown from 'react-markdown';
import { AnnouncementDiscussion } from '@/components/announcements/AnnouncementDiscussion';
import { markdownComponents } from '@/components/blog/markdown-components';

/**
 * The announcement's post and its discussion — the heavy half of
 * `SitewideAnnouncementModal`, loaded only once the dialog has the post to show.
 *
 * The modal is part of the shell overlays chunk that every `_site` page loads
 * after `load`. With `react-markdown` (and the unified pipeline under it), the
 * discussion thread and the markdown components imported statically, that was
 * ~40 KB compressed downloaded on every page view, announcement or not — on a 3G
 * link, a second and a half of bandwidth competing with the reader's first tap.
 *
 * Two exports from one module: the modal places them in two different rows, and
 * both `lazy()` wrappers resolve the same chunk.
 */
export function AnnouncementPost({
  content,
}: {
  content: string;
}) {
  return (
    <ReactMarkdown
      components={
        markdownComponents
      }
    >
      {
        content
      }
    </ReactMarkdown>
  );
}

export { AnnouncementDiscussion };
