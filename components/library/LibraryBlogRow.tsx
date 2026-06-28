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

export function LibraryBlogRow({ posts }: { posts: Partial<Post>[] }) {
  const { t } = useTranslation('library');

  if (!posts.length) return null;

  return (
    <section className="lib__section lib-blog">
      <div className="lib-blog__head">
        <h2 className="lib__section-title">{t('section-blog', { defaultValue: 'Blog' })}</h2>
      </div>
      <div className="lib-blog__row" role="list">
        {posts.map((post) => (
          <Link
            key={post.slug}
            to={`/blog/${post.slug}` as string}
            className="lib-blog__card"
            role="listitem"
          >
            {post.tags && post.tags.length > 0 && (
              <div className="lib-blog__tags">
                {post.tags.slice(0, 3).map((tag) => (
                  <span key={tag} className="lib-blog__tag">{tag}</span>
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
        ))}
      </div>
    </section>
  );
}
