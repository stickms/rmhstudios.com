import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
    try {
        const session = await auth.api.getSession({ headers: await headers() });
        const user = session?.user as any;

        if (!user || (!user.isAdmin)) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { title, slug, description, image, date, tags, content, isEdit } = body;

        console.log(`Saving blog post (${isEdit ? 'EDIT' : 'NEW'}):`, body);

        if (!title || !slug || !date || !description || !content) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        // Validate slug format
        if (!/^[a-z0-9-]+$/.test(slug)) {
            return NextResponse.json({ error: "Invalid slug format. Use lowercase letters, numbers, and hyphens." }, { status: 400 });
        }

        // Check if file already exists ONLY if we aren't editing
        if (!isEdit) {
            const existingPost = await prisma.blogPost.findUnique({ where: { slug } });
            if (existingPost) {
                return NextResponse.json({ error: "A post with this slug already exists" }, { status: 409 });
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

        return NextResponse.json({ success: true, slug });

    } catch (error: any) {
        console.error("Error creating/editing blog post", error);
        return NextResponse.json({ error: "Failed to save blog post" }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const session = await auth.api.getSession({ headers: await headers() });
        const user = session?.user as any;

        if (!user || (!user.isAdmin)) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const slug = searchParams.get("slug");

        if (!slug) {
            return NextResponse.json({ error: "Slug is required" }, { status: 400 });
        }

        try {
            await prisma.blogPost.delete({ where: { slug } });
        } catch (e: any) {
            if (e.code === 'P2025') { // Prisma error code for record not found
                return NextResponse.json({ error: "Post not found" }, { status: 404 });
            }
            throw e;
        }

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error("Error deleting blog post", error);
        return NextResponse.json({ error: "Failed to delete blog post" }, { status: 500 });
    }
}
