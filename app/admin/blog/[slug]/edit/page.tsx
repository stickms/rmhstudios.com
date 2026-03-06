import { auth } from '@/lib/auth';
// TODO: Replace next/headers — use TanStack Start loader for server-side auth
// import { headers } from 'next/headers';
import { PageLayout } from '@/components/feed/PageLayout';
import { MDXEditor } from '@/components/admin/MDXEditor';
import { ArrowLeft } from 'lucide-react';
import { getPostBySlug } from '@/lib/blog';
import { Link, notFound, redirect } from '@tanstack/react-router';

export const metadata = {
    title: 'Edit Blog Post | Admin | RMH Studios',
};

export default async function EditBlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
    // TODO: Move auth check to TanStack Start loader
    const session = await auth.api.getSession({ headers: new Headers() });

    if (!session || !(session.user as any).isAdmin) {
        throw redirect({ to: '/' });
    }

    const { slug } = await params;
    let post;

    try {
        post = await getPostBySlug(slug, ["title", "slug", "date", "description", "image", "tags", "content"]);
    } catch (e) {
        throw notFound();
    }

    return <MDXEditor initialData={post} isEdit={true} />;
}
