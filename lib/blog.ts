import { prisma } from "./prisma.server";

export interface Post {
  slug: string;
  title: string;
  date: string;
  description: string;
  image?: string;
  tags?: string[];
  content: string;
}

export async function getPostSlugs() {
  const posts = await prisma.blogPost.findMany({ select: { slug: true } });
  return posts.map(p => p.slug);
}

export async function getPostBySlug(slug: string, fields: string[] = []) {
  if (!slug) throw new Error("Slug cannot be empty");
  
  const post = await prisma.blogPost.findUnique({ where: { slug } });
  
  if (!post) {
    throw new Error(`Post not found: ${slug}`);
  }

  type Items = {
    [key: string]: string | string[] | boolean | undefined | null;
  };

  const items: Items = {};

  fields.forEach((field) => {
    if (field === "slug") {
      items[field] = post.slug;
    } else if (field === "content") {
      items[field] = post.content;
    } else if (field === "title") {
      items[field] = post.title;
    } else if (field === "date") {
      items[field] = post.date;
    } else if (field === "description") {
      items[field] = post.description;
    } else if (field === "image") {
      items[field] = post.image;
    } else if (field === "tags") {
      items[field] = post.tags;
    } else if (field === "announcement") {
      items[field] = post.announcement;
    } else if (field === "announcementPostId") {
      items[field] = post.announcementPostId;
    } else if (field === "business") {
      items[field] = post.business;
    } else if (field === "announcedAt") {
      items[field] = post.announcedAt ? post.announcedAt.toISOString() : null;
    } else if (field === "announcementExpiresAt") {
      items[field] = post.announcementExpiresAt ? post.announcementExpiresAt.toISOString() : null;
    }
  });

  return items;
}

export async function getAllPosts(fields: string[] = []) {
  const isAllEmpty = fields.length === 0;

  // if fields is empty, just fetch everything
  const posts = await prisma.blogPost.findMany({
    orderBy: { date: 'desc' },
    select: isAllEmpty ? undefined : {
      slug: fields.includes("slug"),
      title: fields.includes("title"),
      date: fields.includes("date"),
      description: fields.includes("description"),
      image: fields.includes("image"),
      tags: fields.includes("tags"),
      content: fields.includes("content"),
      announcement: fields.includes("announcement"),
      business: fields.includes("business")
    }
  });

  return posts as unknown as Record<string, any>[];
}
