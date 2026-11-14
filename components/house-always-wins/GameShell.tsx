import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrivalSuspense } from '@/components/ui/arrive';

const HouseAlwaysWinsGame =
  React.lazy(
    () =>
      import('./game/HouseAlwaysWinsGame').then(
        (
          m,
        ) => ({
          default:
            m.HouseAlwaysWinsGame,
        }),
      ),
  );

interface GameShellProps {
  userName?:
    | string
    | null;
}

export function GameShell({
  userName,
}: GameShellProps) {
  const {
    t,
  } =
    useTranslation(
      'c-house-always-wins',
    );
  return (
    <div
      className="app-viewport bg-neutral-950 text-white"
      data-fluid-press-scope
    >
      {/* Top bar. `app-safe-x`/`app-safe-top` rather than plain padding: turned
          sideways this bar runs under the sensor housing. */}
      <div className="app-safe-top app-safe-x shrink-0 border-b border-neutral-800/50 z-20">
        <div className="flex items-center justify-end gap-3 px-4 py-2">
          <div className="flex min-w-0 items-center gap-4">
            <span className="text-neutral-600 text-[10px] font-mono tracking-wide hidden lg:block">
              {t(
                'controls-hint',
                {
                  defaultValue:
                    'WASD/← → Move • Space Jump • Shift Dash • E Interact • M Menu',
                },
              )}
            </span>
            {userName && (
              <span className="min-w-0 truncate text-neutral-600 text-xs font-mono">
                {
                  userName
                }
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Game area. `app-stage-fit` is the size container the stage measures
          itself against, so the playfield letterboxes rather than stretches. */}
      <div className="app-stage-fit app-safe-x relative flex-1 min-h-0 bg-black">
        <ArrivalSuspense
          fallback={
            <div className="flex items-center justify-center w-full h-full">
              <div className="text-neutral-600 text-sm font-mono tracking-widest animate-pulse">
                {t(
                  'loading',
                  {
                    defaultValue:
                      'LOADING...',
                  },
                )}
              </div>
            </div>
          }
        >
          <HouseAlwaysWinsGame />
        </ArrivalSuspense>
      </div>
    </div>
  );
}
