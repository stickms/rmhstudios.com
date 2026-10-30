import { createFileRoute, notFound } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestSession } from '@/lib/auth-session.server';
import { getSteamProfile } from '@/lib/games/community.server';
import { ProfilePage } from '@/components/steam/ProfilePage';
import { noindexHead } from '@/lib/seo';

const fetchProfile = createServerFn({ method: 'GET' })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const session = await getRequestSession();
    const profile = await getSteamProfile(session?.user.id ?? null, id);
    if (!profile) throw notFound();
    return { profile, signedIn: !!session };
  });

export const Route = createFileRoute('/games/profile/$id')({
  // The public profile at /u/$id is the indexed one; this is a second view of it.
  head: ({ loaderData }: { loaderData?: { profile: { name: string } } }) =>
    noindexHead(loaderData ? `${loaderData.profile.name}'s profile` : 'Profile'),
  loader: ({ params }) => fetchProfile({ data: params.id }),
  component: ProfileRoute,
});

function ProfileRoute() {
  const { profile, signedIn } = Route.useLoaderData();
  return <ProfilePage profile={profile} signedIn={signedIn} />;
}
