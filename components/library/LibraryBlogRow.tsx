/**
 * LibraryBlogRow — the devlog/blog strip at the top of the combined library page.
 *
 * Blog entries used to live on their own /blog page; they now lead the library
 * as text rows on rules (most recent first, three across on a wide page), with the
 * collections and book shelves below. Each row links to the full entry at
 * /blog/$slug.
 */
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Calendar } from 'lucide-react';
import type { Post } from '@/lib/blog';
import { Cells } from '@/components/ui/rules';
import { useReveal } from './LibraryReveal';
import { useLiquidLink } from '@/hooks/useLiquidLink';
import { liquidVTName } from '@/lib/view-transition';
import '@/components/library/library.css';

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
    <section className="lib__section lib-blog lib-section-shell">
      <div className="lib-blog__head">
        <h2 className="lib__section-title">
          {t('section-blog', {
            defaultValue: 'Blog',
          })}
        </h2>
      </div>
      <Cells columns={3} className="lib-blog__row">
        {visible.map((post) => (
          <BlogCard key={post.slug} post={post} />
        ))}
      </Cells>
    </section>
  );
}

function BlogCard({ post, ...rest }: { post: Partial<Post>; 'data-last-row'?: string }) {
  const revealRef = useReveal();
  const liquidOpen = useLiquidLink();
  const slug = post.slug ?? '';
  return (
    <li {...rest}>
      <Link
        ref={revealRef}
        to={`/blog/${post.slug}` as string}
        // §5.48: liquidly expand the row into the article header on click.
        onClick={(e) =>
          liquidOpen(e, liquidVTName('blog', slug), {
            to: `/blog/${slug}`,
          })
        }
        className="lib-blog__card lib-reveal row-hover"
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
    </li>
  );
}
