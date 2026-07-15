/**
 * GameCanvasScene / GameCanvasPage — shared canvas wrapper for full-screen
 * games whose own rendering surface (2D <canvas> or WebGL) stays intact,
 * hosted via LayeredCanvasHost while the Konva scene draws minimal chrome
 * (optional back link). Keeps per-game route files tiny.
 */

import { type ReactNode } from 'react';
import { CanvasPage } from '@/canvas-ui/runtime/CanvasPage';
import { Box } from '@/canvas-ui/runtime/layout/LayoutTree';
import { tw } from '@/canvas-ui/runtime/tw';
import { CanvasText } from '@/canvas-ui/text/Text';
import { CanvasLink } from '@/canvas-ui/widgets/Link';
import { Icon } from '@/canvas-ui/widgets/Icon';
import { icons } from '@/canvas-ui/widgets/icons';
import { LayeredCanvasHost } from '@/canvas-ui/overlay/LayeredCanvasHost';

interface GameSceneProps extends Record<string, unknown> {
  backTo?: string;
  title?: string;
  game: ReactNode;
}

function GameScene({ backTo, title, game }: GameSceneProps) {
  return (
    <Box name="game-scene" style={tw('flex flex-col w-full h-full bg-[#000000]')}>
      {(backTo || title) && (
        <Box style={tw('flex flex-row items-center justify-center w-full pt-3 pb-1')}>
          {backTo && (
            <Box style={tw('flex flex-row absolute top-3 left-3')}>
              <CanvasLink to={backTo} label="RMH Studios" style={tw('flex flex-row items-center gap-1.5 px-2.5 py-1.5 rounded-site-sm bg-[rgba(0,0,0,0.5)] border border-[#27272a]')}>
                <Icon node={icons['arrow-left']} size={16} color="#71717a" />
                <CanvasText style="text-sm text-[#71717a]">RMH Studios</CanvasText>
              </CanvasLink>
            </Box>
          )}
          {title && <CanvasText style="text-3xl font-black italic text-[#ffffff]">{title}</CanvasText>}
        </Box>
      )}
      <LayeredCanvasHost kind="game-2d" under={false} style={tw('flex flex-col flex-1 w-full')}>
        <div style={{ position: 'absolute', inset: 0 }}>{game}</div>
      </LayeredCanvasHost>
    </Box>
  );
}

export function GameCanvasPage({
  routeId,
  title,
  backTo,
  visibleTitle,
  game,
  mirrorDescription,
}: {
  routeId: string;
  title: string;
  backTo?: string;
  /** Title drawn in the top bar (omit for chromeless games). */
  visibleTitle?: string;
  game: ReactNode;
  mirrorDescription: string;
}) {
  return (
    <CanvasPage
      routeId={routeId}
      scene={GameScene}
      sceneProps={{ backTo, title: visibleTitle, game }}
      mirror={
        <div>
          <h1>{title}</h1>
          <p>{mirrorDescription}</p>
          {backTo && <a href={backTo}>Back to RMH Studios</a>}
        </div>
      }
      shell="fullscreen"
      title={title}
    />
  );
}
