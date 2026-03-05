import { redirect, notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { PageLayout } from '@/components/feed/PageLayout';
import { MDXEditor } from '@/components/admin/MDXEditor';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getPostBySlug } from '@/lib/blog';

export const metadata = {
    title: 'Edit Blog Post | Admin | RMH Studios',
};

export default async function EditBlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session || !(session.user as any).isAdmin) {
        redirect('/');
    }

    const { slug } = await params;
    let post;

    try {
        post = await getPostBySlug(slug, ["title", "slug", "date", "description", "image", "tags", "content"]);
    } catch (e) {
        notFound();
    }

    return <MDXEditor initialData={post} isEdit={true} />;
}
