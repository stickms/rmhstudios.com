import { prisma } from './prisma.server';
import { publishedLogWhere } from '@/lib/blog/publication';
import { findLogForAdmin } from '@/lib/blog/publication.server';

export interface Post {
  slug: string;
  title: string;
  date: string;
  description: string;
  image?: string;
  tags?: string[];
  content: string;
}

/** Slugs of the live Logs. */
export async function getPostSlugs() {
  const posts = await prisma.blogPost.findMany({
    where: publishedLogWhere(new Date()),
    select: {
      slug: true,
    },
  });
  return posts.map((p) => p.slug);
}

type Items = Record<string, string | string[] | boolean | undefined | null>;

interface PickablePost {
  slug: string;
  title: string;
  date: string;
  description: string;
  image: string | null;
  tags: string[];
  content: string;
  announcement: boolean;
  announcementPostId: string | null;
  business: string;
  announcedAt: Date | null;
  announcementExpiresAt: Date | null;
  status: string;
  publishAt: Date | null;
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** The requested fields of a Log, in the shape the routes read. */
function pickFields(post: PickablePost, fields: string[]): Items {
  const available: Items = {
    slug: post.slug,
    content: post.content,
    title: post.title,
    date: post.date,
    description: post.description,
    image: post.image,
    tags: post.tags,
    announcement: post.announcement,
    announcementPostId: post.announcementPostId,
    business: post.business,
    announcedAt: iso(post.announcedAt),
    announcementExpiresAt: iso(post.announcementExpiresAt),
    status: post.status,
    publishAt: iso(post.publishAt),
  };
  const items: Items = {};
  for (const field of fields) {
    if (field in available) items[field] = available[field];
  }
  return items;
}

/**
 * One Log by slug; throws when there is none. Only a live Log is found unless `admin` is set, which is for the
 * editor and for an admin previewing a draft at its real address.
 */
export async function getPostBySlug(
  slug: string,
  fields: string[] = [],
  opts: {
    admin?: boolean;
  } = {},
) {
  if (!slug) throw new Error('Slug cannot be empty');

  const post = opts.admin
    ? await findLogForAdmin(slug)
    : await prisma.blogPost.findFirst({
        where: {
          slug,
          ...publishedLogWhere(new Date()),
        },
      });

  if (!post) {
    throw new Error(`Post not found: ${slug}`);
  }
  return pickFields(post, fields);
}

/** The live Logs, newest first. */
export async function getAllPosts(fields: string[] = []) {
  const isAllEmpty = fields.length === 0;

  const posts = await prisma.blogPost.findMany({
    where: publishedLogWhere(new Date()),
    orderBy: {
      date: 'desc',
    },
    select: isAllEmpty
      ? undefined
      : {
          slug: fields.includes('slug'),
          title: fields.includes('title'),
          date: fields.includes('date'),
          description: fields.includes('description'),
          image: fields.includes('image'),
          tags: fields.includes('tags'),
          content: fields.includes('content'),
          announcement: fields.includes('announcement'),
          business: fields.includes('business'),
        },
  });

  return posts as unknown as Record<string, any>[];
}
