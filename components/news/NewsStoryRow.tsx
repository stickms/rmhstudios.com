import { Link } from '@tanstack/react-router';
import type { NewsFrontItem } from '@/lib/news';
import { cn } from '@/lib/utils';
import { NewsMeta, NewsPicture } from './NewsParts';

interface NewsStoryRowProps {
  story: NewsFrontItem;
  /** Hide the excerpt (the lead's side column, where four rows share the lead's height). */
  compact?: boolean;
  className?: string;
}

/**
 * One headline as a row on a rule (Steel R3, section 5): meta, headline and excerpt on the left, the picture on the
 * right when the outlet published one. The whole row is one link to the article page.
 */
export function NewsStoryRow({ story, compact = false, className }: NewsStoryRowProps) {
  return (
    <li className={cn('border-b border-site-border last:border-b-0', className)}>
      <Link to="/news/$slug" params={{ slug: story.slug }} className="group flex items-start gap-4 py-4">
        <div className="min-w-0 flex-1 space-y-1">
          <NewsMeta category={story.category} publisher={story.sourcePublisher} publishedAt={story.publishedAt} />
          <h3 className="t-heading text-site-text group-hover:underline">{story.title}</h3>
          {!compact && story.description ? (
            <p className="t-body line-clamp-2 text-site-text-muted">{story.description}</p>
          ) : null}
        </div>
        {story.image ? (
          <NewsPicture
            src={story.image}
            className={cn('shrink-0', compact ? 'aspect-square w-16' : 'aspect-[4/3] w-24 sm:w-36')}
          />
        ) : null}
      </Link>
    </li>
  );
}
