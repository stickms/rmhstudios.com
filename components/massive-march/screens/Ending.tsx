/**
 * Massive March — the ending.
 *
 * §13.5: finishing does not close the island. The gate is a designed conclusion
 * and a real one, but the world stays open afterwards — for the puzzles the
 * group walked past, for the places they liked, and for the considerable number
 * of people who will want to go and kick a glowing ball into the sea now that
 * nothing depends on it.
 *
 * What this screen shows is deliberately not a score. There is no rank, no time
 * and no completion percentage beyond the count of sites, because the thing the
 * group actually built over eleven hours — the words they invented for the
 * glyphs, who is good at directions — is not something a results screen can
 * hold.
 */

'use client';

import { useTranslation } from 'react-i18next';
import { avatarColor, LAND, TOY } from '@/lib/massive-march/palette';
import { useMmStore } from '@/lib/massive-march/store';
import { mm } from '@/lib/massive-march/net/client';
import { PUZZLE_SITES, TOTAL_ORBS } from '@/lib/massive-march/world/sites';
import { BOARD, INK, MarchButton, Panel } from '../ui';

export function Ending() {
  const { t } = useTranslation('c-massive-march');
  const world = useMmStore((s) => s.world);
  const session = useMmStore((s) => s.session);
  const setScreen = useMmStore((s) => s.setScreen);

  const solved = world?.puzzles.filter((p) => p.state === 'solved').length ?? 0;
  const skipped = world?.puzzles.filter((p) => p.state === 'skipped').length ?? 0;

  return (
    <div
      className="app-page items-center-safe justify-center-safe flex px-5"
      style={{
        background: `linear-gradient(180deg, ${TOY.blueDeep} 0%, ${LAND.waterDeep} 45%, ${TOY.red} 100%)`,
      }}
    >
      <div className="w-full max-w-xl space-y-5 py-10">
        <Panel className="space-y-4 text-center">
          <span
            aria-hidden
            className="mx-auto block h-16 w-28 border-[3px]"
            style={{ background: TOY.white, borderColor: INK, borderBottom: 'none', borderRadius: '48px 48px 0 0' }}
          />
          <h1 className="text-3xl font-black tracking-tight">
            {t('ending-title', { defaultValue: 'You walk through together.' })}
          </h1>
          <p className="text-sm leading-relaxed opacity-80">
            {t('ending-body', {
              defaultValue:
                'Nobody explains the gate, or the towers, or why any of it wanted red things. That was never the part you were going to find out.',
            })}
          </p>
        </Panel>

        <Panel className="space-y-3">
          <h2 className="text-xs font-black tracking-[0.14em] uppercase opacity-70">
            {t('ending-tally', { defaultValue: 'What the island has of yours' })}
          </h2>
          <dl className="grid grid-cols-3 gap-3 text-center">
            <div>
              <dt className="text-[11px] font-bold tracking-wide uppercase opacity-60">
                {t('ending-solved', { defaultValue: 'Solved' })}
              </dt>
              <dd className="text-2xl font-black">
                {solved}
                <span className="text-sm opacity-60">/{PUZZLE_SITES.length}</span>
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-bold tracking-wide uppercase opacity-60">
                {t('ending-skipped', { defaultValue: 'Skipped' })}
              </dt>
              <dd className="text-2xl font-black">{skipped}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-bold tracking-wide uppercase opacity-60">
                {t('ending-given', { defaultValue: 'Given' })}
              </dt>
              <dd className="text-2xl font-black">
                {world?.deposited ?? 0}
                <span className="text-sm opacity-60">/{TOTAL_ORBS}</span>
              </dd>
            </div>
          </dl>

          {session ? (
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              {session.members.map((member) => (
                <span key={member.socketId} className="flex items-center gap-1.5 text-xs font-bold">
                  <span
                    aria-hidden
                    className="size-3.5 rounded-full border-2"
                    style={{ background: avatarColor(member.slot), borderColor: INK }}
                  />
                  {member.name}
                </span>
              ))}
            </div>
          ) : null}
        </Panel>

        <Panel tone="dark" className="space-y-3">
          <p className="text-sm leading-relaxed" style={{ color: BOARD }}>
            {t('ending-after', {
              defaultValue:
                'The island is still there. Anything you left unfinished is still unfinished, the cart still runs, and the hoop does not care that you have nothing left to prove.',
            })}
          </p>
          <div className="flex flex-wrap gap-3">
            <MarchButton tone="primary" className="flex-1" onClick={() => setScreen('world')}>
              {t('ending-back', { defaultValue: 'Go back out' })}
            </MarchButton>
            <MarchButton
              tone="ghost"
              onClick={() => {
                mm.leave();
                useMmStore.getState().leave();
              }}
            >
              {t('ending-done', { defaultValue: 'That’s enough walking' })}
            </MarchButton>
          </div>
        </Panel>
      </div>
    </div>
  );
}
