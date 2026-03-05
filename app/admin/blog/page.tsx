import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { PageLayout } from '@/components/feed/PageLayout';
import Link from 'next/link';
import { getAllPosts } from '@/lib/blog';
import { ArrowLeft, Plus, Edit, Trash2 } from 'lucide-react';
import { DeleteBlogButton } from '@/components/admin/DeleteBlogButton';

export const metadata = {
    title: 'Manage Blog Posts | Admin | RMH Studios',
};

export default async function AdminBlogDashboard() {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session || !(session.user as any).isAdmin) {
        redirect('/');
    }

    const posts = await getAllPosts(["title", "slug", "date"]);

    return (
        <PageLayout title="Manage Blog Posts" wide>
            <div className="p-4 md:p-8 w-full max-w-4xl mx-auto space-y-6">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                        <Link href="/admin" className="text-site-text-dim hover:text-site-text transition-colors">
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <div>
                            <h1 className="text-2xl font-bold font-display text-site-text">Manage Blog Posts</h1>
                            <p className="text-site-text-muted mt-1 text-sm">Create, edit, and delete blog posts.</p>
                        </div>
                    </div>
                    
                    <Link href="/admin/blog/new" className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 gap-2 bg-site-accent hover:bg-site-accent-hover text-white">
                        <Plus className="w-4 h-4" /> New Post
                    </Link>
                </div>

                <div className="bg-site-surface border border-site-border rounded-xl divide-y divide-site-border overflow-hidden">
                    {posts.length === 0 ? (
                        <div className="p-8 text-center text-site-text-dim">
                            No blog posts found. Create one to get started!
                        </div>
                    ) : (
                        posts.map((post) => (
                            <div key={post.slug as string} className="flex items-center justify-between p-4 hover:bg-site-bg/50 transition-colors">
                                <div>
                                    <h3 className="font-bold text-site-text">{post.title as string}</h3>
                                    <p className="text-sm text-site-text-dim">{post.date as string} · /{post.slug as string}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Link 
                                        href={`/admin/blog/${post.slug as string}/edit`}
                                        className="inline-flex items-center justify-center p-2 rounded-md hover:bg-site-border text-site-text-dim hover:text-site-text transition-colors"
                                        title="Edit Post"
                                    >
                                        <Edit className="w-4 h-4" />
                                    </Link>
                                    <DeleteBlogButton slug={post.slug as string} title={post.title as string} />
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </PageLayout>
    );
}
