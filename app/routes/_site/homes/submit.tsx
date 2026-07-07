/**
 * RMHHomes — post / edit a listing (/homes/submit, /homes/submit?edit=<id>)
 */
import { useEffect, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import { PageLayout } from '@/components/feed/PageLayout';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { ListingForm } from '@/components/homes/ListingForm';
import type { Listing } from '@/lib/homes/types';

export const Route = createFileRoute('/_site/homes/submit')({
  head: () => ({ meta: [{ title: 'RMHHomes — Post a listing' }] }),
  validateSearch: (search: Record<string, unknown>): { edit?: string } =>
    typeof search.edit === 'string' ? { edit: search.edit } : {},
  component: HomesSubmitPage,
});

function HomesSubmitPage() {
  const { data: session, isPending } = useSession();
  const { edit: editId } = Route.useSearch();
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!editId || !session) return;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/homes/listings/${encodeURIComponent(editId)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.listing?.isOwner) setListing(data.listing);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [editId, session]);

  const isEditing = Boolean(editId);
  const title = isEditing ? 'Edit listing' : 'Post a listing';

  if (isPending) {
    return (
      <PageLayout title={title} backTo="/homes" wide>
        <div className="grid place-items-center py-24 text-site-text-muted">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </PageLayout>
    );
  }

  if (!session) {
    return (
      <PageLayout title={title} backTo="/homes" wide>
        <div className="mx-auto max-w-md px-4 py-20 text-center text-site-text-dim">
          <p className="mb-4">Sign in to post a home on RMHHomes.</p>
          <Link to="/login" search={{ callbackURL: '/homes/submit' }}>
            <Button>Sign in</Button>
          </Link>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title={title} backTo="/homes" backLabel="Back to browse" wide>
      <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-4 md:px-6">
        {isEditing && loading ? (
          <div className="grid place-items-center py-20 text-site-text-muted">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : isEditing && !listing ? (
          <div className="py-20 text-center text-site-text-dim">
            You can only edit your own listings.
          </div>
        ) : (
          <ListingForm listing={listing ?? undefined} />
        )}
      </div>
    </PageLayout>
  );
}
