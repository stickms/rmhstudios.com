/**
 * Offline fallback page, served by the service worker when a navigation
 * fails while the network is unreachable. Kept intentionally free of data
 * loaders and heavy imports so the cached HTML renders standalone.
 *
 * Canvas-converted: renders through the Konva stage (CanvasPage) with a
 * semantic DOM mirror for the SW-cached HTML crawlers/AT see.
 */

import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';
import { CanvasPage } from '@/canvas-ui/runtime/CanvasPage';
import { Box } from '@/canvas-ui/runtime/layout/LayoutTree';
import { tw } from '@/canvas-ui/runtime/tw';
import { CanvasText } from '@/canvas-ui/text/Text';
import { Button } from '@/canvas-ui/widgets/Button';
import { Icon } from '@/canvas-ui/widgets/Icon';
import { icons } from '@/canvas-ui/widgets/icons';

export const Route = createFileRoute('/offline')({
  head: () => ({
    meta: [
      { title: 'Offline | RMH Studios' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: OfflinePage,
});

interface OfflineSceneProps extends Record<string, unknown> {
  title: string;
  body: string;
  retry: string;
}

function OfflineScene({ title, body, retry }: OfflineSceneProps) {
  return (
    <Box name="offline" style={tw('flex flex-col flex-1 w-full h-full items-center justify-center gap-4 bg-site-bg px-6')}>
      <Icon node={icons['wifi-off']} size={48} color={{ token: 'text-dim' }} />
      <CanvasText style="text-2xl font-bold text-site-text text-center">{title}</CanvasText>
      <Box style={tw('w-full max-w-[384px]')}>
        <CanvasText style="text-sm text-site-text-muted text-center">{body}</CanvasText>
      </Box>
      <Box style={tw('mt-2')}>
        <Button
          onPress={() => window.location.reload()}
          before={<Icon node={icons['rotate-cw']} size={16} color={{ token: 'accent-fg' }} />}
        >
          {retry}
        </Button>
      </Box>
    </Box>
  );
}

function OfflineMirror({ title, body, retry }: OfflineSceneProps) {
  return (
    <div>
      <h1>{title}</h1>
      <p>{body}</p>
      <button type="button" onClick={() => window.location.reload()}>{retry}</button>
    </div>
  );
}

function OfflinePage() {
  const { t } = useTranslation('common');
  const sceneProps: OfflineSceneProps = useMemo(() => ({
    title: t('offline-title', { defaultValue: "You're offline" }),
    body: t('offline-body', { defaultValue: 'RMH Studios needs a connection for this page. Check your network and try again.' }),
    retry: t('offline-retry', { defaultValue: 'Try again' }),
  }), [t]);

  return (
    <CanvasPage
      routeId="/offline"
      scene={OfflineScene}
      sceneProps={sceneProps}
      mirror={<OfflineMirror {...sceneProps} />}
      shell="fullscreen"
      title={sceneProps.title}
    />
  );
}
