import { createFileRoute, redirect } from '@tanstack/react-router';

// "Wallet" was renamed to "Predictions". Keep this route as a permanent redirect
// so old links/bookmarks don't 404.
export const Route = createFileRoute('/_site/wallet')({
  beforeLoad: () => {
    throw redirect({ to: '/predictions' });
  },
});
