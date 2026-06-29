'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import { fmt } from '@/lib/temple-of-joy/numbers';
import type { GameState, RelicId, SourceId } from '@/lib/temple-of-joy/types';
import { SOURCES } from '@/lib/temple-of-joy/data/sources';
import { UPGRADES } from '@/lib/temple-of-joy/data/upgrades';
import { RELICS } from '@/lib/temple-of-joy/data/relics';
import { WHEEL_UPGRADES } from '@/lib/temple-of-joy/data/wheel';
import { ASCENSION_UPGRADES } from '@/lib/temple-of-joy/data/ascension';
import { OBJECTIVES } from '@/lib/temple-of-joy/data/objectives';
import { ACHIEVEMENTS } from '@/lib/temple-of-joy/data/achievements';
import {
  computeSourceCost, computeUpgradeCost, computeIsUpgradeVisible,
  computeRadianceGain, computeCanAscend, computeAscensionPrestigeReq,
} from '@/lib/temple-of-joy/engine';
import { Panel3D } from './ui3d/Panel3D';
import { Label3D } from './ui3d/Label3D';
import { Button3D } from './ui3d/Button3D';

type Tab = GameState['activeTab'];

interface Row {
  id: string;
  title: string;
  sub?: string;
  right?: string;
  actionLabel?: string;
  action?: () => void;
  enabled?: boolean;
  accent?: string;
  done?: boolean;
}

const S = () => useTempleStore.getState();
const pct = (v: number) => `${Math.round(v * 100)}%`;

function buildRows(tab: Tab, s: GameState): { header: string; rows: Row[] } {
  switch (tab) {
    case 'sources': {
      const rows: Row[] = SOURCES.filter((d) => {
        const owned = s.sources[d.id] ?? 0;
        return owned > 0 || s.peakHappiness >= d.baseCost * 0.1;
      }).map((d) => {
        const owned = s.sources[d.id] ?? 0;
        const cost = computeSourceCost(d.id, owned, s);
        return {
          id: d.id, title: `${d.icon} ${d.name}`, sub: d.tagline, right: `x${owned}`,
          actionLabel: `💰 ${fmt(cost, s.numberFormat)}`, enabled: s.happiness >= cost,
          action: () => S().buySource(d.id as SourceId),
        };
      });
      return { header: `🌿 Sources · ${fmt(s.happiness, s.numberFormat)}`, rows };
    }
    case 'upgrades': {
      const avail = UPGRADES.filter((u) => !s.upgrades.has(u.id) && computeIsUpgradeVisible(u.id, s))
        .sort((a, b) => computeUpgradeCost(a.id, s) - computeUpgradeCost(b.id, s));
      const rows: Row[] = avail.map((u) => {
        const cost = computeUpgradeCost(u.id, s);
        return {
          id: u.id, title: u.name, sub: u.flavor,
          actionLabel: `💰 ${fmt(cost, s.numberFormat)}`, enabled: s.happiness >= cost,
          action: () => S().purchaseUpgrade(u.id),
        };
      });
      return { header: `⬆ Upgrades · ${fmt(s.happiness, s.numberFormat)}`, rows };
    }
    case 'relics': {
      const visible = RELICS.filter((r) => s.activeRelics.includes(r.id) || s.peakKarma >= r.karmaCost * 0.1)
        .sort((a, b) => a.karmaCost - b.karmaCost);
      const rows: Row[] = visible.map((r) => {
        const equipped = s.activeRelics.includes(r.id);
        const hasSlot = s.activeRelics.length < s.maxRelicSlots;
        const canAfford = s.karma >= r.karmaCost;
        return {
          id: r.id, title: `💍 ${r.name}`, sub: r.description, done: equipped,
          right: equipped ? '✓' : `☯ ${r.karmaCost}`,
          actionLabel: equipped ? 'Unequip' : 'Equip',
          enabled: equipped || (hasSlot && canAfford),
          action: () => equipped ? S().unequipRelic(r.id as RelicId) : S().equipRelic(r.id as RelicId),
        };
      });
      return { header: `💍 Relics · ☯ ${Math.floor(s.karma)} · ${s.activeRelics.length}/${s.maxRelicSlots}`, rows };
    }
    case 'wheel': {
      const visible = WHEEL_UPGRADES.filter((w) => {
        const reqMet = !w.requires?.length || w.requires.every((r) => s.wheelPurchased.has(r));
        return s.wheelPurchased.has(w.id) || reqMet;
      });
      const rows: Row[] = visible.map((w) => {
        const owned = s.wheelPurchased.has(w.id);
        return {
          id: w.id, title: w.name, sub: w.description, done: owned,
          right: owned ? '✓' : `💎 ${w.shardCost}`,
          actionLabel: owned ? undefined : 'Buy', enabled: !owned && s.blissShards >= w.shardCost,
          action: owned ? undefined : () => S().purchaseWheelUpgrade(w.id),
        };
      });
      return { header: `🔄 Wheel · 💎 ${s.blissShards}`, rows };
    }
    case 'ascension': {
      const canAsc = computeCanAscend(s);
      const gain = computeRadianceGain(s);
      const req = computeAscensionPrestigeReq(s);
      const rows: Row[] = [
        {
          id: '__ascend', title: '☀ Ascend', sub: `Prestige ${s.prestigeCount}/${req} · reset the prestige layer for permanent Radiance`,
          right: `+${fmt(gain, s.numberFormat)} ☀`, actionLabel: canAsc ? 'Ascend' : 'Locked', enabled: canAsc,
          accent: '#ffd27a', action: () => S().ascend(),
        },
        ...ASCENSION_UPGRADES.map((u) => {
          const owned = s.ascensionUpgrades.has(u.id);
          const prereq = !u.requires || u.requires.every((id) => s.ascensionUpgrades.has(id));
          return {
            id: u.id, title: u.name, sub: u.description, done: owned, accent: '#ffd27a',
            right: owned ? '✓' : `${fmt(u.cost, s.numberFormat)} ☀`,
            actionLabel: owned ? undefined : 'Buy', enabled: !owned && prereq && s.radiance >= u.cost,
            action: owned ? undefined : () => S().purchaseAscensionUpgrade(u.id),
          } as Row;
        }),
      ];
      return { header: `☀ Ascension · ${fmt(s.radiance, s.numberFormat)} Radiance`, rows };
    }
    case 'objectives': {
      const rows: Row[] = OBJECTIVES.map((o) => {
        const done = s.completedObjectives.has(o.id);
        const reward = [o.reward.radiance ? `+${o.reward.radiance}☀` : '', o.reward.blissShards ? `+${o.reward.blissShards}💎` : '', o.reward.karma ? `+${o.reward.karma}☯` : ''].filter(Boolean).join(' ');
        return { id: o.id, title: `${done ? '✅' : '⬜'} ${o.name}`, sub: o.description, right: reward, done };
      });
      return { header: `🎯 Objectives · ${s.completedObjectives.size}/${OBJECTIVES.length}`, rows };
    }
    case 'achievements': {
      const rows: Row[] = ACHIEVEMENTS.map((a) => {
        const got = s.achievements.has(a.id);
        return { id: a.id, title: `${got ? '🏆' : '🔒'} ${got ? a.name : '???'}`, sub: got ? a.description : 'Locked', done: got };
      });
      return { header: `🏆 Achievements · ${s.achievements.size}/${ACHIEVEMENTS.length}`, rows };
    }
    case 'settings': {
      const rows: Row[] = [
        { id: 'theme', title: '🎨 Theme', sub: 'Switch the temple palette', right: s.theme, actionLabel: 'Toggle', enabled: true, action: () => S().setTheme(s.theme === 'dark' ? 'light' : 'dark') },
        { id: 'sound', title: '🔊 Sound', sub: 'Master sound', right: s.soundEnabled ? 'On' : 'Off', actionLabel: 'Toggle', enabled: true, action: () => S().setSoundEnabled(!s.soundEnabled) },
        { id: 'music', title: '🎵 Music volume', sub: 'Cycle music volume', right: pct(s.musicVolume), actionLabel: '+', enabled: true, action: () => S().setMusicVolume(Math.round(((s.musicVolume + 0.25) % 1.25) * 100) / 100) },
        { id: 'sfx', title: '🔔 SFX volume', sub: 'Cycle effects volume', right: pct(s.sfxVolume), actionLabel: '+', enabled: true, action: () => S().setSfxVolume(Math.round(((s.sfxVolume + 0.25) % 1.25) * 100) / 100) },
        { id: 'numfmt', title: '🔢 Number format', sub: 'How big numbers display', right: s.numberFormat, actionLabel: 'Toggle', enabled: true, action: () => S().setNumberFormat(s.numberFormat === 'abbreviated' ? 'scientific' : 'abbreviated') },
        { id: 'autobuy', title: '🤖 Auto-buy', sub: 'Automatically buy sources', right: s.autoBuyEnabled ? 'On' : 'Off', actionLabel: 'Toggle', enabled: true, action: () => S().setAutoBuyEnabled(!s.autoBuyEnabled) },
      ];
      return { header: '⚙ Settings', rows };
    }
    default:
      return { header: '', rows: [] };
  }
}

/**
 * A screen-anchored 3D "codex" panel that renders any tab's data as paged,
 * interactive 3D rows (label + action button) — the in-world replacement for the
 * old HTML data panels. Lives inside the <Hud> layer.
 */
export function CodexPanel3D({ tab, w, h }: { tab: Tab; w: number; h: number }) {
  const { t } = useTranslation('c-temple-of-joy');
  const [page, setPage] = useState(0);
  const [, force] = useState(0);

  // Refresh live data periodically so costs/affordability/ownership update.
  useEffect(() => {
    const id = window.setInterval(() => force((n) => n + 1), 400);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => { setPage(0); }, [tab]);

  const { header, rows } = useMemo(() => buildRows(tab, useTempleStore.getState()), [tab, page, force]); // eslint-disable-line react-hooks/exhaustive-deps

  const PW = Math.min(w * 0.94, 9.5);
  const PH = Math.min(h * 0.86, 7.4);
  const PER = Math.max(3, Math.floor((PH - 1.8) / 0.92));
  const pageCount = Math.max(1, Math.ceil(rows.length / PER));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = rows.slice(safePage * PER, safePage * PER + PER);

  const top = PH / 2;
  const rowH = 0.9;
  const listTop = top - 1.2;

  return (
    <Panel3D width={PW} height={PH} billboard={false}>
      {/* Title + close */}
      <Label3D text={header} billboard={false} height={0.3} options={{ color: '#f0c84a', fontSize: 56, maxWidth: 900 }} position={[0, top - 0.5, 0.06]} />
      <Button3D label="✕" onClick={() => useTempleStore.getState().setActiveTab('temple')} width={0.55} height={0.5} fontSize={42} color="#6b4c2a" position={[PW / 2 - 0.5, top - 0.5, 0.1]} billboard={false} />

      {/* Rows */}
      {pageRows.map((r, i) => {
        const y = listTop - i * rowH;
        return (
          <group key={r.id}>
            <Label3D text={r.title} billboard={false} anchorX="left" height={0.22} options={{ color: r.done ? '#f0c84a' : '#e8d5b0', fontSize: 40, align: 'left', maxWidth: 760 }} position={[-PW / 2 + 0.35, y + 0.18, 0.06]} />
            {r.sub && (
              <Label3D text={r.sub} billboard={false} anchorX="left" height={0.15} options={{ color: '#b9a273', fontSize: 26, italic: true, align: 'left', maxWidth: 820 }} position={[-PW / 2 + 0.35, y - 0.1, 0.06]} />
            )}
            {r.right && (
              <Label3D text={r.right} billboard={false} height={0.18} options={{ color: r.accent ?? '#d4a847', fontSize: 32 }} position={[PW / 2 - 1.95, y, 0.06]} />
            )}
            {r.actionLabel && (
              <Button3D
                label={r.actionLabel}
                onClick={r.action ?? (() => {})}
                enabled={r.enabled ?? true}
                pulse={r.enabled ?? false}
                width={1.5}
                height={0.42}
                fontSize={32}
                color={r.accent ?? '#d4a847'}
                position={[PW / 2 - 0.95, y, 0.1]}
                billboard={false}
              />
            )}
          </group>
        );
      })}

      {rows.length === 0 && (
        <Label3D text={t('nothing-here-yet', { defaultValue: 'Nothing here yet…' })} billboard={false} height={0.24} options={{ color: '#b9a273', italic: true, fontSize: 40 }} position={[0, 0, 0.06]} />
      )}

      {/* Pager */}
      {pageCount > 1 && (
        <group position={[0, -top + 0.5, 0.1]}>
          <Button3D label="‹ Prev" onClick={() => setPage((p) => Math.max(0, p - 1))} enabled={safePage > 0} width={1.4} height={0.42} fontSize={32} position={[-1.7, 0, 0]} billboard={false} />
          <Label3D text={`${safePage + 1} / ${pageCount}`} billboard={false} height={0.2} options={{ color: '#e8d5b0', fontSize: 34 }} position={[0, 0, 0.06]} />
          <Button3D label="Next ›" onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} enabled={safePage < pageCount - 1} width={1.4} height={0.42} fontSize={32} position={[1.7, 0, 0]} billboard={false} />
        </group>
      )}
    </Panel3D>
  );
}
