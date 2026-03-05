import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { PageLayout } from '@/components/feed/PageLayout';
import { MDXEditor } from '@/components/admin/MDXEditor';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const metadata = {
    title: 'Create Blog Post | Admin | RMH Studios',
};

export default async function NewBlogPostPage() {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session || !(session.user as any).isAdmin) {
        redirect('/');
    }

    return <MDXEditor />;
}
