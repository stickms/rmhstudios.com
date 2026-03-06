import { auth } from '@/lib/auth';
// TODO: Replace next/headers — use TanStack Start loader for server-side auth
// import { headers } from 'next/headers';
import { PageLayout } from '@/components/feed/PageLayout';
import { MDXEditor } from '@/components/admin/MDXEditor';
import { ArrowLeft } from 'lucide-react';
import { Link, redirect } from '@tanstack/react-router';

export const metadata = {
    title: 'Create Blog Post | Admin | RMH Studios',
};

export default async function NewBlogPostPage() {
    // TODO: Move auth check to TanStack Start loader
    const session = await auth.api.getSession({ headers: new Headers() });

    if (!session || !(session.user as any).isAdmin) {
        throw redirect({ to: '/' });
    }

    return <MDXEditor />;
}
