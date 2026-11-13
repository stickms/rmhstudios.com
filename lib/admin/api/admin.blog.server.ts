import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { logAdminAction } from '@/lib/admin-audit.server';
import { pingIndexNow } from '@/lib/seo/indexnow.server';
import { Prisma } from '@prisma/client';
import { blogPostSchema } from '@/lib/admin/schemas';
import {
  applyAnnouncementFields,
  invalidateCurrentAnnouncement,
} from '@/lib/sitewide-announcement.server';

import { implement } from '@/lib/api/implement.server';
import { saveBlogPostApi } from '@/lib/admin/admin-tools.contract';
export const route = apiRoute('/api/admin/blog', {
  POST: implement(
    saveBlogPostApi,
    { auth: 'admin', rateLimit: { policy: 'write', scope: 'user' }, body: blogPostSchema },
    async ({ body, session }) => {
      const user = session.user;

      const { title, slug, description, image, date, tags, content, isEdit } = body;

      const baseData = { title, date, description, image: image || null, tags, content };
      try {
        const existing = isEdit
          ? await prisma.blogPost.findUnique({
              where: { slug },
              select: { id: true, announcement: true, announcedAt: true },
            })
          : null;
        const { data: announcementData, reannounced } = applyAnnouncementFields(
          existing,
          {
            announcement: body.announcement,
            business: body.business,
            announcementExpiresAt: body.announcementExpiresAt,
          },
          new Date(),
        );
        const data = { ...baseData, ...announcementData };

        // A create must never update a concurrent writer's post with the same slug.
        if (isEdit) {
          const update = prisma.blogPost.update({ where: { slug }, data });
          if (existing && reannounced) {
            // Re-announcing: everyone sees it again.
            await prisma.$transaction([
              prisma.blogAnnouncementSeen.deleteMany({ where: { postId: existing.id } }),
              update,
            ]);
          } else {
            await update;
          }
        } else {
          await prisma.blogPost.create({ data: { slug, ...data } });
        }
        await invalidateCurrentAnnouncement();
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          if (error.code === 'P2002') {
            return Response.json(
              { error: 'A post with this slug already exists' },
              { status: 409 },
            );
          }
          if (error.code === 'P2025') {
            return Response.json({ error: 'Post not found' }, { status: 404 });
          }
        }
        throw error;
      }

      await logAdminAction(user.id, isEdit ? 'blog.edit' : 'blog.create', {
        targetType: 'BlogPost',
        targetId: slug,
        detail: title,
      });

      // The post is live at /blog/<slug> the moment the write commits, and
      // every blogPost row is in the sitemap unconditionally (see
      // lib/sitemap.server.ts). Tell IndexNow now rather than waiting for the
      // next crawl. Fire-and-forget by contract — never awaited, never throws.
      pingIndexNow([`/blog/${slug}`]);

      return Response.json({ success: true, slug });
    },
  ),
  DELETE: defineHandler(
    { auth: 'admin', rateLimit: { policy: 'write', scope: 'user' } },
    async ({ request, session }) => {
      const user = session.user;

      const { searchParams } = new URL(request.url);
      const slug = searchParams.get('slug');

      if (!slug) {
        return Response.json({ error: 'Slug is required' }, { status: 400 });
      }

      try {
        await prisma.blogPost.delete({ where: { slug } });
        await invalidateCurrentAnnouncement();
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
          // Prisma error code for record not found
          return Response.json({ error: 'Post not found' }, { status: 404 });
        }
        throw e;
      }

      await logAdminAction(user.id, 'blog.delete', { targetType: 'BlogPost', targetId: slug });

      return Response.json({ success: true });
    },
  ),
});
