import { createFileRoute } from '@tanstack/react-router';
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const Route = createFileRoute('/api/admin/blog')({
  server: {
    handlers: {
  POST: async ({ request }) => {
    try {
        const session = await auth.api.getSession({ headers: request.headers });
        const user = session?.user as any;

        if (!user || (!user.isAdmin)) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const { title, slug, description, image, date, tags, content, isEdit } = body;

        console.log(`Saving blog post (${isEdit ? 'EDIT' : 'NEW'}):`, body);

        if (!title || !slug || !date || !description || !content) {
            return Response.json({ error: "Missing required fields" }, { status: 400 });
        }

        // Validate slug format
        if (!/^[a-z0-9-]+$/.test(slug)) {
            return Response.json({ error: "Invalid slug format. Use lowercase letters, numbers, and hyphens." }, { status: 400 });
        }

        // Check if file already exists ONLY if we aren't editing
        if (!isEdit) {
            const existingPost = await prisma.blogPost.findUnique({ where: { slug } });
            if (existingPost) {
                return Response.json({ error: "A post with this slug already exists" }, { status: 409 });
            }
        }

        let formattedTags: string[] = [];
        if (tags && Array.isArray(tags)) {
           formattedTags = tags;
        } else if (typeof tags === 'string' && tags.trim() !== '') {
           formattedTags = [tags];
        }

        await prisma.blogPost.upsert({
            where: { slug },
            update: {
                title,
                date,
                description,
                image: image || null,
                tags: formattedTags,
                content
            },
            create: {
                slug,
                title,
                date,
                description,
                image: image || null,
                tags: formattedTags,
                content
            }
        });

        return Response.json({ success: true, slug });

    } catch (error: any) {
        console.error("Error creating/editing blog post", error);
        return Response.json({ error: "Failed to save blog post" }, { status: 500 });
    }
},
  DELETE: async ({ request }) => {
    try {
        const session = await auth.api.getSession({ headers: request.headers });
        const user = session?.user as any;

        if (!user || (!user.isAdmin)) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const slug = searchParams.get("slug");

        if (!slug) {
            return Response.json({ error: "Slug is required" }, { status: 400 });
        }

        try {
            await prisma.blogPost.delete({ where: { slug } });
        } catch (e: any) {
            if (e.code === 'P2025') { // Prisma error code for record not found
                return Response.json({ error: "Post not found" }, { status: 404 });
            }
            throw e;
        }

        return Response.json({ success: true });

    } catch (error: any) {
        console.error("Error deleting blog post", error);
        return Response.json({ error: "Failed to delete blog post" }, { status: 500 });
    }
},
    },
  },
});
