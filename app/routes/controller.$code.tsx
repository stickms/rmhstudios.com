/**
 * Phone-as-controller pad (E3). Full-screen and top-level like the games it
 * drives; opened by scanning the QR on a game's "Phone controller" panel.
 */
import { createFileRoute } from '@tanstack/react-router';
import { ControllerPad } from '@/components/party/ControllerPad';
import { buildMeta } from '@/lib/seo';

function ControllerPage() {
  const { code } = Route.useParams();
  return <ControllerPad code={code} />;
}

export const Route = createFileRoute('/controller/$code')({
  head: () => ({
    meta: [
      ...buildMeta({
        title: 'Phone Controller | RMH Studios',
        description: 'Use your phone as a game controller.',
        path: '/controller',
      }),
      { name: 'robots', content: 'noindex' },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no',
      },
    ],
  }),
  component: ControllerPage,
});
