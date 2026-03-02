'use client';

import { CANVAS_WIDTH, CANVAS_HEIGHT } from '@/lib/dream-rift/constants';
import { TouhouFrame, TouhouMenuButton, TouhouDivider } from './TouhouFrame';

export function DreamRiftPause({
  onResume,
  onRestart,
  onQuit,
}: {
  onResume: () => void;
  onRestart: () => void;
  onQuit: () => void;
}) {
  return (
    <div
      className="absolute inset-0 z-40 flex flex-col items-center justify-center"
      style={{
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        background: 'rgba(5,3,20,0.85)',
        backdropFilter: 'blur(2px)',
      }}
    >
      <TouhouFrame className="w-52">
        <div className="py-4 px-2">
          <div className="text-center mb-3">
            <h2
              className="text-lg tracking-[0.3em] text-amber-300/70"
              style={{ fontFamily: "'Georgia', serif" }}
            >
              PAUSED
            </h2>
            <TouhouDivider />
          </div>

          <TouhouMenuButton variant="accent" onClick={onResume}>
            Resume
          </TouhouMenuButton>
          <TouhouMenuButton onClick={onRestart}>
            Restart
          </TouhouMenuButton>
          <TouhouMenuButton onClick={onQuit}>
            Quit to Title
          </TouhouMenuButton>

          <div className="mt-3 text-center">
            <TouhouDivider />
            <p
              className="text-[9px] text-zinc-600 tracking-wider"
              style={{ fontFamily: "'Georgia', serif" }}
            >
              Press Esc to resume
            </p>
          </div>
        </div>
      </TouhouFrame>
    </div>
  );
}
