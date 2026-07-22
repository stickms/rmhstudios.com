/**
 * LibraryBlogRow — the devlog/blog strip at the top of the combined library page.
 *
 * Blog entries used to live on their own /blog page; they now lead the library
 * as a single horizontally-scrolling row (most recent on the left), with the
 * collections and book shelves below. Each card links to the full entry at
 * /blog/$slug.
 */
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Calendar } from 'lucide-react';
import type { Post } from '@/lib/blog';
import { useReveal } from './LibraryReveal';
import { useLiquidLink } from '@/hooks/useLiquidLink';
import { liquidVTName } from '@/lib/view-transition';

export function LibraryBlogRow({ posts, query = '' }: { posts: Partial<Post>[]; query?: string }) {
  const { t } = useTranslation('library');
  const q = query.trim().toLowerCase();
  const visible = q
    ? posts.filter(
        (post) =>
          post.title?.toLowerCase().includes(q) ||
          post.description?.toLowerCase().includes(q) ||
          post.tags?.some((tag) => tag.toLowerCase().includes(q)),
      )
    : posts;

  if (!visible.length) return null;

  return (
    <section className="lib__section lib-blog glass-fill lib-section-shell">
      <div className="lib-blog__head">
        <h2 className="lib__section-title">{t('section-blog', { defaultValue: 'Blog' })}</h2>
      </div>
      <div className="lib-blog__row" role="list">
        {visible.map((post) => (
          <BlogCard key={post.slug} post={post} />
        ))}
      </div>
    </section>
  );
}

function BlogCard({ post }: { post: Partial<Post> }) {
  const revealRef = useReveal();
  const liquidOpen = useLiquidLink();
  const slug = post.slug ?? '';
  return (
    <Link
      ref={revealRef}
      to={`/blog/${post.slug}` as string}
      // §5.48: liquidly expand the card into the article header on click.
      onClick={(e) => liquidOpen(e, liquidVTName('blog', slug), { to: `/blog/${slug}` })}
      className="lib-blog__card lib-reveal glass-fill glass-interactive lib-orbit-card"
      data-glass-light=""
      data-library-orbit=""
      role="listitem"
    >
      {post.tags && post.tags.length > 0 && (
        <div className="lib-blog__tags">
          {post.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="lib-blog__tag">
              {tag}
            </span>
          ))}
        </div>
      )}
      <h3 className="lib-blog__title">{post.title}</h3>
      {post.description && <p className="lib-blog__desc">{post.description}</p>}
      <div className="lib-blog__date">
        <Calendar size={12} aria-hidden="true" />
        <span>{post.date}</span>
      </div>
    </Link>
  );
}
