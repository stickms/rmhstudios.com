/**
 * Massive March — the installation you are standing in.
 *
 * Shows what the machine is doing and, when you are close enough to the part
 * that takes input, the controls for it. Console buttons live here rather than
 * on the console mesh for two reasons: clicking a small box while pointer-locked
 * in first person is unpleasant with a mouse and impossible without one, and a
 * button in the DOM can be reached with Tab, named for a screen reader and made
 * larger by the text-size setting.
 *
 * Nothing here decides anything. Every control emits an intent and the hub
 * re-checks that this player is physically able to do it.
 */

'use client';

import { useTranslation } from 'react-i18next';
import { Lock, MoonStar, Users } from 'lucide-react';
import { activePads, activeTotems } from '@/lib/massive-march/puzzles';
import { live } from '@/lib/massive-march/live';
import { mm } from '@/lib/massive-march/net/client';
import type { PuzzleStatus } from '@/lib/massive-march/net/events';
import { TOY } from '@/lib/massive-march/palette';
import { useMmStore } from '@/lib/massive-march/store';
import type { WorldVariant } from '@/lib/massive-march/constants';
import { puzzleSite, type PuzzleSite } from '@/lib/massive-march/world/sites';
import { Glyph } from '../Glyph';
import { BOARD, Chip, INK, MarchButton, Meter, Panel } from '../ui';

function near(x: number, z: number, radius: number): boolean {
  return Math.hypot(live.self.x - x, live.self.z - z) <= radius;
}

export function SitePanel({ siteId, variant }: { siteId: string; variant: WorldVariant }) {
  const { t } = useTranslation('c-massive-march');
  const status = useMmStore((s) => s.world?.puzzles.find((p) => p.id === siteId));
  const allowSkip = useMmStore((s) => s.session?.allowSkip ?? false);
  const isHost = useMmStore((s) => s.session?.hostSocketId === s.selfSocketId);
  const site = puzzleSite(siteId);
  if (!site || !status) return null;

  const done = status.state === 'solved' || status.state === 'skipped';

  return (
    <Panel className="w-[min(22rem,72vw)] space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base leading-tight font-black">{site.name}</h2>
          <p className="text-[11px] font-bold tracking-[0.14em] uppercase opacity-60">{site.sign}</p>
        </div>
        {done ? (
          <Chip color={TOY.green}>
            {status.state === 'skipped'
              ? t('site-skipped', { defaultValue: 'Skipped' })
              : t('site-done', { defaultValue: 'Done' })}
          </Chip>
        ) : null}
      </div>

      {status.lockedBy ? <LockNote reason={status.lockedBy} /> : null}

      {!done ? (
        <>
          <Meter value={status.step} total={Math.max(1, status.total)} />
          <StatusLine site={site} status={status} variant={variant} />
        </>
      ) : null}

      {!done && !status.lockedBy ? (
        <Controls site={site} status={status} variant={variant} />
      ) : null}

      {!done && allowSkip && isHost ? (
        <MarchButton
          tone="ghost"
          style={{ color: INK, borderColor: 'rgba(34,32,29,0.35)' }}
          className="w-full"
          onClick={() => mm.skip(site.id)}
        >
          {t('skip-this', { defaultValue: 'Skip this challenge' })}
        </MarchButton>
      ) : null}
    </Panel>
  );
}

function LockNote({ reason }: { reason: 'key' | 'night' | 'crew' }) {
  const { t } = useTranslation('c-massive-march');
  const Icon = reason === 'night' ? MoonStar : reason === 'crew' ? Users : Lock;
  const text =
    reason === 'key'
      ? t('lock-key', { defaultValue: 'Nothing here responds yet. A tower has not been fed.' })
      : reason === 'night'
        ? t('lock-night', { defaultValue: 'This only happens after dark.' })
        : t('lock-crew', { defaultValue: 'There are more places to stand than there are of you.' });
  return (
    <p className="flex items-start gap-2 text-xs leading-snug opacity-80">
      <Icon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      {text}
    </p>
  );
}

function StatusLine({
  site,
  status,
  variant,
}: {
  site: PuzzleSite;
  status: PuzzleStatus;
  variant: WorldVariant;
}) {
  const { t } = useTranslation('c-massive-march');

  switch (site.kind) {
    case 'pads':
      return (
        <p className="text-xs opacity-80">
          {t('pads-status', {
            defaultValue: '{{held}} of {{total}} pads have somebody on them.',
            held: status.held?.length ?? 0,
            total: activePads(site, variant).length,
          })}
        </p>
      );
    case 'booth':
      return (
        <p className="text-xs opacity-80">
          {t('booth-status', {
            defaultValue: '{{n}} entered. Wrong one and it starts again.',
            n: status.pressed?.length ?? 0,
          })}
        </p>
      );
    case 'blind':
      return (
        <p className="text-xs opacity-80">
          {status.wearer === null || status.wearer === undefined
            ? t('blind-idle', { defaultValue: 'Nobody is wearing the bucket.' })
            : t('blind-status', {
                defaultValue: 'Plate {{n}} of {{total}}.',
                n: status.step + 1,
                total: status.total,
              })}
        </p>
      );
    case 'totems':
      return (
        <p className="text-xs opacity-80">
          {t('totems-status', {
            defaultValue: '{{n}} of {{total}} facing the right way.',
            n: status.step,
            total: activeTotems(site, variant).length,
          })}
        </p>
      );
    case 'hoop':
      return (
        <p className="text-xs opacity-80">
          {t('hoop-status', {
            defaultValue: '{{n}} of {{total}} through.',
            n: status.throws ?? 0,
            total: site.hoop?.throws ?? 3,
          })}
        </p>
      );
    case 'hunt':
      return (
        <p className="text-xs opacity-80">
          {t('hunt-status', {
            defaultValue: '{{n}} of {{total}} dug up. Somebody needs the finder.',
            n: status.found ?? 0,
            total: status.total,
          })}
        </p>
      );
    case 'final':
      return (
        <p className="text-xs opacity-80">
          {status.stage === 0
            ? t('final-read', { defaultValue: 'Read it. Somebody is in the booth.' })
            : status.stage === 1
              ? t('final-turn', { defaultValue: 'Turn them. Somebody is on the lookout.' })
              : t('final-stand', { defaultValue: 'Stand on them. All of you, together.' })}
        </p>
      );
    default:
      return null;
  }
}

function Controls({
  site,
  status,
  variant,
}: {
  site: PuzzleSite;
  status: PuzzleStatus;
  variant: WorldVariant;
}) {
  const { t } = useTranslation('c-massive-march');
  const buttons = status.buttons ?? [];

  const atConsole = Boolean(site.console && near(site.console.x, site.console.z, site.console.r + 1.5));
  const totem = activeTotems(site, variant).find((entry) => near(entry.x, entry.z, entry.r + 1.5));

  if (atConsole && buttons.length > 0 && (site.kind !== 'final' || status.stage === 0)) {
    return (
      <div className="space-y-2">
        <p className="text-[11px] font-black tracking-[0.14em] uppercase opacity-60">
          {t('console', { defaultValue: 'The console' })}
        </p>
        <div className="flex flex-wrap gap-2">
          {buttons.map((symbol) => (
            <button
              key={symbol}
              type="button"
              aria-label={symbol}
              onClick={() => mm.press(site.id, symbol)}
              className="grid size-12 cursor-pointer place-items-center border-[3px] transition-colors duration-150 hover:brightness-95"
              style={{ borderColor: INK, background: BOARD, borderRadius: 3 }}
            >
              <Glyph symbol={symbol} size={26} color={INK} />
            </button>
          ))}
        </div>
        {status.pressed && status.pressed.length > 0 ? (
          <p className="flex items-center gap-1 text-xs opacity-70">
            {t('entered-so-far', { defaultValue: 'So far:' })}
            {status.pressed.map((symbol, index) => (
              <Glyph key={`${symbol}-${index}`} symbol={symbol} size={16} color={INK} />
            ))}
          </p>
        ) : null}
      </div>
    );
  }

  if (totem) {
    return (
      <MarchButton tone="primary" className="w-full" onClick={() => mm.turn(site.id, totem.id)}>
        {t('turn-totem', { defaultValue: 'Turn this totem' })}
      </MarchButton>
    );
  }

  if (site.hunt) {
    return (
      <MarchButton className="w-full" onClick={() => mm.dig(site.id)}>
        {t('dig', { defaultValue: 'Dig here' })}
      </MarchButton>
    );
  }

  return null;
}
