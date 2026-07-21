import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { PageLayout } from '@/components/feed/PageLayout';
import { ThemeStudio } from '@/components/themes/ThemeStudio';
import { auth } from '@/lib/auth';
import { getUserTier } from '@/lib/entitlements';
import { listMyThemes, listShop, listOwnedThemes } from '@/lib/themes/themes.server';
import type { UserThemeView } from '@/lib/themes/tokens';

interface StudioData {
  mine: UserThemeView[];
  shop: UserThemeView[];
  owned: UserThemeView[];
  signedIn: boolean;
  isMember: boolean;
}

const fetchStudio = createServerFn({ method: 'GET' }).handler(async (): Promise<StudioData> => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
  const userId = session?.user.id ?? null;
  const [mine, shop, owned, tier] = await Promise.all([
    userId ? listMyThemes(userId) : Promise.resolve([]),
    listShop('top'),
    userId ? listOwnedThemes(userId) : Promise.resolve([]),
    userId ? getUserTier(userId) : Promise.resolve('free' as const),
  ]);
  return { mine, shop, owned, signedIn: !!session, isMember: tier !== 'free' };
});

export const Route = createFileRoute('/_site/studio/themes')({
  head: () => ({
    meta: [{ title: 'Theme Studio | RMH Studios' }, { name: 'robots', content: 'noindex' }],
  }),
  loader: () => fetchStudio(),
  component: ThemeStudioPage,
});

function ThemeStudioPage() {
  const data = Route.useLoaderData();
  return (
    <PageLayout title="Theme Studio" backTo="/shop">
      <ThemeStudio
        initialMine={data.mine}
        initialShop={data.shop}
        initialOwned={data.owned}
        signedIn={data.signedIn}
        isMember={data.isMember}
      />
    </PageLayout>
  );
}
