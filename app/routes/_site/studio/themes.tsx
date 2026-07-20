import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { PageLayout } from '@/components/feed/PageLayout';
import { ThemeStudio } from '@/components/themes/ThemeStudio';
import { auth } from '@/lib/auth';
import { listMyThemes, listShop } from '@/lib/themes/themes.server';
import type { UserThemeView } from '@/lib/themes/tokens';

interface StudioData {
  mine: UserThemeView[];
  shop: UserThemeView[];
  signedIn: boolean;
}

const fetchStudio = createServerFn({ method: 'GET' }).handler(async (): Promise<StudioData> => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
  const [mine, shop] = await Promise.all([
    session ? listMyThemes(session.user.id) : Promise.resolve([]),
    listShop('top'),
  ]);
  return { mine, shop, signedIn: !!session };
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
      <ThemeStudio initialMine={data.mine} initialShop={data.shop} signedIn={data.signedIn} />
    </PageLayout>
  );
}
