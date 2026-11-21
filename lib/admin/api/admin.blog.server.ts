import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { logAdminAction } from '@/lib/admin-audit.server';
import { pingIndexNow } from '@/lib/seo/indexnow.server';
import { Prisma } from '@prisma/client';
import { blogPostSchema } from '@/lib/admin/schemas';
import {
  applyAnnouncementFields,
} from '@/lib/sitewide-announcement.server';

import {
  isLogStatus,
  resolveTransition,
  revisionChanged,
} from '@/lib/blog/publication';
import { invalidateLogCaches, publishDay, saveRevision } from '@/lib/blog/publication.server';
import { implement } from '@/lib/api/implement.server';
import { saveBlogPostApi } from '@/lib/admin/admin-tools.contract';

/** What a refused status change tells the editor; never an echo of a caught error. */
const TRANSITION_ERRORS = {
  'invalid-schedule': 'Pick a date and time to schedule it',
  'too-soon': 'Schedule at least 5 minutes ahead',
  'too-far': 'Schedule within the next year',
  'already-published': 'A live Log cannot be scheduled; unpublish it first',
} as const;

export const route = apiRoute('/api/admin/blog', {
  POST: implement(
    saveBlogPostApi,
    { auth: 'admin', rateLimit: { policy: 'write', scope: 'user' }, body: blogPostSchema },
    async ({ body, session }) => {
      const user = session.user;

      const { title, slug, description, image, tags, content, isEdit } = body;
      const now = new Date();

      try {
        const existing = isEdit
          ? await prisma.blogPost.findUnique({
              where: { slug },
              select: {
                id: true,
                announcement: true,
                announcedAt: true,
                status: true,
                publishedAt: true,
                title: true,
                description: true,
                tags: true,
                content: true,
              },
            })
          : null;
        if (isEdit && !existing) {
          return Response.json({ error: 'Post not found' }, { status: 404 });
        }

        const transition = resolveTransition(
          existing
            ? { status: isLogStatus(existing.status) ? existing.status : 'published', publishedAt: existing.publishedAt }
            : null,
          body.status,
          body.publishAt,
          now,
        );
        if (!transition.ok) {
          return Response.json({ error: TRANSITION_ERRORS[transition.reason] }, { status: 400 });
        }

        const { data: announcementData, reannounced: announcedNow } = applyAnnouncementFields(
          existing,
          {
            announcement: body.announcement,
            business: body.business,
            announcementExpiresAt: body.announcementExpiresAt,
          },
          now,
        );
        // A Log that goes live with the announcement on is announced from that moment, not from when it was
        // saved as a draft: stamp it now and show it to everyone again.
        const goesLiveAnnounced = transition.becamePublished && body.announcement;
        const reannounced = announcedNow || goesLiveAnnounced;
        if (goesLiveAnnounced) announcementData.announcedAt = now;

        const data = {
          title,
          description,
          image: image || null,
          tags,
          content,
          // An empty date becomes the publish day when the Log goes live (FR-7).
          date: body.date || (transition.columns.status === 'published' ? publishDay(now) : ''),
          ...transition.columns,
          updatedById: user.id,
          ...announcementData,
        };
        const revision = { authorId: user.id, title, description, tags, content };

        if (isEdit && existing) {
          await prisma.$transaction(async (tx) => {
            await tx.blogPost.update({ where: { slug }, data });
            if (reannounced) await tx.blogAnnouncementSeen.deleteMany({ where: { postId: existing.id } });
            if (revisionChanged(existing, { title, description, tags, content })) {
              await saveRevision(tx, { postId: existing.id, ...revision });
            }
          });
        } else {
          // A create must never update a concurrent writer's post with the same slug.
          await prisma.$transaction(async (tx) => {
            const created = await tx.blogPost.create({ data: { slug, ...data }, select: { id: true } });
            await saveRevision(tx, { postId: created.id, ...revision });
          });
        }
        await invalidateLogCaches();
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
        detail: `${title} (${body.status})`,
      });

      // A live Log is in the sitemap the moment the write commits: tell IndexNow now rather than waiting for the
      // next crawl. A draft or a scheduled Log is not public yet (the publish job pings when it goes out).
      // Fire-and-forget by contract — never awaited, never throws.
      if (body.status === 'published') pingIndexNow([`/blog/${slug}`]);

      return Response.json({ success: true, slug, status: body.status });
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
        await invalidateLogCaches();
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
