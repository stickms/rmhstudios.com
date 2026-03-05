import { notFound } from 'next/navigation';
import { BuildDetail } from '@/components/user-builds';

interface PageProps {
  params: Promise<{ slug: string }>;
}

async function getBuild(slug: string) {
  const baseUrl = process.env.NEXT_PUBLIC_BETTER_AUTH_URL || 'http://localhost:3000';
  const res = await fetch(`${baseUrl}/api/user-builds/${slug}`, {
    cache: 'no-store',
  });

  if (!res.ok) {
    return null;
  }

  return res.json();
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const build = await getBuild(slug);

  if (!build) {
    return { title: 'Build Not Found' };
  }

  return {
    title: `${build.title} | Builds`,
    description: build.description,
    openGraph: {
      title: build.title,
      description: build.description,
      images: build.thumbnailUrl ? [build.thumbnailUrl] : undefined,
    },
  };
}

export default async function BuildPage({ params }: PageProps) {
  const { slug } = await params;
  const build = await getBuild(slug);

  if (!build) {
    notFound();
  }

  const backHref = build.category?.slug ? `/builds/${build.category.slug}` : '/builds';

  return (
    <div className="min-h-screen bg-site-bg pt-20 pb-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <BuildDetail build={build} backHref={backHref} />
      </div>
    </div>
  );
}
