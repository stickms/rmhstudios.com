'use client';

import { useTranslation } from "react-i18next";
import { useDreamRiftStore } from '@/lib/dream-rift/store';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '@/lib/dream-rift/constants';
import { TouhouFrame, TouhouMenuButton, TouhouDivider } from './TouhouFrame';

export function DreamRiftGameOver({ onQuit }: { onQuit: () => void }) {
  const useContinue = useDreamRiftStore((s) => s.useContinue);
  const continues = useDreamRiftStore((s) => s.continues);
  const difficulty = useDreamRiftStore((s) => s.difficulty);
  const player = useDreamRiftStore((s) => s.player);
  const totalScore = useDreamRiftStore((s) => s.totalScore);
  const setScreen = useDreamRiftStore((s) => s.setScreen);
  const { t } = useTranslation("c-dream-rift");

  const maxContinues =
    difficulty === 'easy' ? 5 :
    difficulty === 'normal' ? 3 :
    difficulty === 'hard' ? 1 : 0;

  const remaining = maxContinues - continues;
  const canContinue = remaining > 0;

  return (
    <div
      className="absolute inset-0 z-40 flex flex-col items-center justify-center"
      style={{
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        background: 'radial-gradient(ellipse at center, rgba(40,5,10,0.95) 0%, rgba(8,4,15,0.97) 100%)',
      }}
    >
      <TouhouFrame className="w-72">
        <div className="py-4 px-4">
          {/* Title */}
          <div className="text-center mb-3">
            <h2
              className="text-2xl tracking-[0.2em]"
              style={{
                fontFamily: "'Georgia', serif",
                color: '#cc3344',
                textShadow: '0 0 20px rgba(204,51,68,0.4), 0 0 40px rgba(204,51,68,0.1)',
              }}
            >
              {t("game-over", { defaultValue: "GAME OVER" })}
            </h2>
            <TouhouDivider />
          </div>

          {/* Score box */}
          <div className="border border-amber-400/15 bg-white/[0.02] p-3 mb-3">
            <div className="text-center mb-2">
              <div className="text-[8px] tracking-[0.2em] text-amber-400/40 uppercase">
                {t("final-score", { defaultValue: "Final Score" })}
              </div>
              <div
                className="text-lg text-white tabular-nums font-mono mt-0.5"
                style={{ textShadow: '0 0 8px rgba(255,255,255,0.15)' }}
              >
                {totalScore.toLocaleString()}
              </div>
            </div>

            <div className="flex justify-between text-[10px] mt-2 pt-2 border-t border-white/5">
              <div className="text-center flex-1">
                <div className="text-amber-400/40 text-[8px] tracking-wider uppercase">{t("graze", { defaultValue: "Graze" })}</div>
                <div className="text-zinc-400 tabular-nums font-mono mt-0.5">
                  {player.graze.toLocaleString()}
                </div>
              </div>
              <div className="w-px bg-white/5" />
              <div className="text-center flex-1">
                <div className="text-amber-400/40 text-[8px] tracking-wider uppercase">{t("continues", { defaultValue: "Continues" })}</div>
                <div className="text-zinc-400 tabular-nums font-mono mt-0.5">{continues}</div>
              </div>
            </div>
          </div>

          {/* Continue prompt */}
          {canContinue && (
            <div className="text-center mb-2">
              <p className="text-[10px] text-zinc-500" style={{ fontFamily: "'Georgia', serif" }}>
                {t("continues-remaining", { defaultValue: "Continues remaining:" })} <span className="text-amber-300">{remaining}</span>
              </p>
            </div>
          )}

          <TouhouDivider />

          {/* Buttons */}
          <div className="mt-1">
            {canContinue && (
              <TouhouMenuButton variant="accent" onClick={() => useContinue()}>
                {t("continue", { defaultValue: "Continue" })}
              </TouhouMenuButton>
            )}
            <TouhouMenuButton onClick={() => setScreen('leaderboard')}>
              {t("leaderboard", { defaultValue: "Leaderboard" })}
            </TouhouMenuButton>
            <TouhouMenuButton onClick={onQuit}>
              {t("quit-to-title", { defaultValue: "Quit to Title" })}
            </TouhouMenuButton>
          </div>
        </div>
      </TouhouFrame>
    </div>
  );
}
