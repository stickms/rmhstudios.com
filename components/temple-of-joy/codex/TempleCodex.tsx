/**
 * The codex — every list the temple has.
 *
 * One panel per tab, all sharing the same row primitive, so a source, an
 * upgrade, a relic and an achievement are recognisably the same kind of thing
 * with different contents. Each panel samples the store on its own heartbeat
 * rather than subscribing to a game that ticks 60 times a second.
 *
 * The long lists (600 upgrades, 900 achievements) are windowed — see
 * `useWindowedList` — so opening the trophy case doesn't put nine hundred DOM
 * nodes on the page.
 */
'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import { fmt, formatDuration } from '@/lib/temple-of-joy/numbers';
import type { GameState, RelicId, SourceId, UpgradePath } from '@/lib/temple-of-joy/types';
import { SOURCES } from '@/lib/temple-of-joy/data/sources';
import { UPGRADES } from '@/lib/temple-of-joy/data/upgrades';
import { RELICS } from '@/lib/temple-of-joy/data/relics';
import { WHEEL_UPGRADES } from '@/lib/temple-of-joy/data/wheel';
import { ASCENSION_UPGRADES } from '@/lib/temple-of-joy/data/ascension';
import { OBJECTIVES } from '@/lib/temple-of-joy/data/objectives';
import { ACHIEVEMENTS } from '@/lib/temple-of-joy/data/achievements';
import {
  computeSourceCost,
  computeSourceCostN,
  computeMaxAffordable,
  computeUpgradeCost,
  computeIsUpgradeVisible,
  computeCanAscend,
  computeRadianceGain,
  computeAscensionPrestigeReq,
} from '@/lib/temple-of-joy/engine';
import { useTempleSnapshot, useTempleValue } from '../hooks';
import { TempleRow, TempleSegments, TempleEmpty, TempleButton, Glyph, LiveValue } from '../ui';

const store = () => useTempleStore.getState();

/* ─── Windowing ─────────────────────────────────────────────────────────── */

/**
 * Render a slice of a long list and grow it as the player scrolls.
 *
 * Not a virtualiser: rows are variable-height and the lists are read
 * top-to-bottom, so "render 60, add 60 when you near the end" gets the whole
 * benefit for a fraction of the complexity — and keeps ⌘F working on what is
 * on screen.
 */
const PAGE = 60;

function useWindowedList<T>(
  items: T[],
  scrollRef: React.RefObject<HTMLElement | null>,
  /** Changing this collapses the window — a new filter is a new list. */
  resetKey: string,
) {
  const [limit, setLimit] = useState(PAGE);

  // Keyed on the filter, not on `items.length`: the length changes every time
  // the player buys something, and collapsing the window mid-scroll would
  // yank the list out from under them.
  useEffect(() => {
    setLimit(PAGE);
  }, [resetKey]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node || limit >= items.length) return;

    const onScroll = () => {
      const remaining = node.scrollHeight - node.scrollTop - node.clientHeight;
      if (remaining < 600) setLimit((current) => Math.min(items.length, current + PAGE));
    };

    node.addEventListener('scroll', onScroll, { passive: true });
    // Fire once: a short list in a tall panel never scrolls, so the handler
    // above would never run and the rest would never appear.
    onScroll();
    return () => node.removeEventListener('scroll', onScroll);
  }, [items.length, limit, scrollRef]);

  return items.slice(0, limit);
}

/* ─── Shell ─────────────────────────────────────────────────────────────── */

export function TempleCodex() {
  const { t } = useTranslation('c-temple-of-joy');
  const tab = useTempleValue((s) => s.activeTab);
  const scrollRef = useRef<HTMLDivElement>(null);

  // A tab change should start at the top of the new list, not wherever the
  // previous one happened to be scrolled to.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [tab]);

  const panels: Record<GameState['activeTab'], { title: string; body: ReactNode }> = {
    temple: {
      title: t('tab-temple', { defaultValue: 'Temple' }),
      body: <OverviewPanel />,
    },
    sources: { title: t('tab-sources', { defaultValue: 'Sources' }), body: <SourcesPanel /> },
    upgrades: {
      title: t('tab-upgrades', { defaultValue: 'Upgrades' }),
      body: <UpgradesPanel scrollRef={scrollRef} />,
    },
    relics: { title: t('tab-relics', { defaultValue: 'Relics' }), body: <RelicsPanel /> },
    wheel: { title: t('tab-wheel', { defaultValue: 'Wheel' }), body: <WheelPanel /> },
    ascension: {
      title: t('tab-ascension', { defaultValue: 'Ascension' }),
      body: <AscensionPanel />,
    },
    objectives: {
      title: t('tab-objectives', { defaultValue: 'Goals' }),
      body: <ObjectivesPanel />,
    },
    achievements: {
      title: t('tab-achievements', { defaultValue: 'Trophies' }),
      body: <AchievementsPanel scrollRef={scrollRef} />,
    },
    settings: { title: t('tab-settings', { defaultValue: 'Settings' }), body: <SettingsPanel /> },
  };

  const panel = panels[tab];

  return (
    <section
      className="toj-codex"
      id="toj-codex-panel"
      role="tabpanel"
      aria-label={panel.title}
      // A tab panel must be focusable so keyboard users can reach its content
      // straight after choosing a tab.
      tabIndex={-1}
    >
      <header className="toj-codex-head">
        <h2 className="toj-codex-title">{panel.title}</h2>
        <CodexTally tab={tab} />
      </header>
      <div className="toj-codex-scroll toj-scroll" ref={scrollRef}>
        {panel.body}
      </div>
    </section>
  );
}

/** The right-hand figure in the codex header: what this tab is spending. */
function CodexTally({ tab }: { tab: GameState['activeTab'] }) {
  if (tab === 'relics') {
    return (
      <span className="toj-codex-sub">
        <Glyph>☯️</Glyph> <LiveValue read={(s) => `${fmt(Math.floor(s.karma), s.numberFormat)}`} />
      </span>
    );
  }
  if (tab === 'wheel') {
    return (
      <span className="toj-codex-sub">
        <Glyph>💎</Glyph> <LiveValue read={(s) => fmt(s.blissShards, s.numberFormat)} />
      </span>
    );
  }
  if (tab === 'ascension') {
    return (
      <span className="toj-codex-sub">
        <Glyph>☀️</Glyph> <LiveValue read={(s) => fmt(s.radiance, s.numberFormat)} />
      </span>
    );
  }
  if (tab === 'sources' || tab === 'upgrades') {
    return (
      <span className="toj-codex-sub">
        <LiveValue read={(s) => fmt(s.happiness, s.numberFormat)} />
      </span>
    );
  }
  return null;
}

/* ─── Overview ──────────────────────────────────────────────────────────── */

function OverviewPanel() {
  const { t } = useTranslation('c-temple-of-joy');
  const stats = useTempleSnapshot(
    (s) => ({
      format: s.numberFormat,
      hpc: s.getHPC(),
      hps: s.getHPS(),
      multiplier: s.getGlobalHPSMultiplier(),
      lifetime: s.lifetimeHappiness,
      clicks: s.totalClicks,
      playtime: s.totalPlaytime,
      prestige: s.prestigeCount,
      ascensions: s.ascensionCount,
      achievements: s.achievements.size,
      sources: Object.values(s.sources).reduce((sum, n) => sum + (n ?? 0), 0),
      upgrades: s.upgrades.size,
    }),
    500,
  );

  const rows: { label: string; value: string }[] = [
    {
      label: t('per-click', { defaultValue: 'Per offering' }),
      value: fmt(stats.hpc, stats.format),
    },
    {
      label: t('per-second-short', { defaultValue: 'Per second' }),
      value: fmt(stats.hps, stats.format),
    },
    {
      label: t('global-multiplier', { defaultValue: 'Global multiplier' }),
      value: `×${stats.multiplier.toFixed(2)}`,
    },
    {
      label: t('lifetime-joy', { defaultValue: 'Lifetime joy' }),
      value: fmt(stats.lifetime, stats.format),
    },
    {
      label: t('sources-owned', { defaultValue: 'Sources owned' }),
      value: fmt(stats.sources, stats.format),
    },
    {
      label: t('upgrades-bought', { defaultValue: 'Upgrades bought' }),
      value: `${stats.upgrades}`,
    },
    { label: t('offerings-made', { defaultValue: 'Offerings made' }), value: `${stats.clicks}` },
    {
      label: t('time-in-temple', { defaultValue: 'Time in temple' }),
      value: formatDuration(stats.playtime),
    },
    { label: t('transcendences', { defaultValue: 'Transcendences' }), value: `${stats.prestige}` },
    { label: t('ascensions', { defaultValue: 'Ascensions' }), value: `${stats.ascensions}` },
    {
      label: t('trophies-earned', { defaultValue: 'Trophies earned' }),
      value: `${stats.achievements} / ${ACHIEVEMENTS.length}`,
    },
  ];

  return (
    <>
      {rows.map((row) => (
        <div className="toj-setting" key={row.label}>
          <span className="toj-setting-label">{row.label}</span>
          <span className="toj-setting-control toj-row-price">{row.value}</span>
        </div>
      ))}
    </>
  );
}

/* ─── Sources ───────────────────────────────────────────────────────────── */

const BUY_QUANTITIES: { value: GameState['sourceBuyQty']; label: string }[] = [
  { value: 1, label: '×1' },
  { value: 10, label: '×10' },
  { value: 100, label: '×100' },
  { value: 'max', label: 'Max' },
];

function SourcesPanel() {
  const { t } = useTranslation('c-temple-of-joy');
  const qty = useTempleValue((s) => s.sourceBuyQty);

  const rows = useTempleSnapshot((s) => {
    const quantity = s.sourceBuyQty;
    return SOURCES.filter((def) => {
      const owned = s.sources[def.id] ?? 0;
      // Sticky reveal on peak happiness: a source you could once nearly afford
      // stays visible after a spending spree.
      return owned > 0 || s.peakHappiness >= def.baseCost * 0.1;
    }).map((def) => {
      const owned = s.sources[def.id] ?? 0;
      const count = quantity === 'max' ? Math.max(1, computeMaxAffordable(def.id, s)) : quantity;
      const cost =
        count === 1
          ? computeSourceCost(def.id, owned, s)
          : computeSourceCostN(def.id, owned, count, s);
      return {
        id: def.id,
        name: def.name,
        tagline: def.tagline,
        icon: def.icon,
        owned,
        count,
        cost,
        affordable: s.happiness >= cost,
        rate: def.baseHPS,
        format: s.numberFormat,
      };
    });
  }, 250);

  if (rows.length === 0) {
    return (
      <TempleEmpty>
        {t('sources-empty', { defaultValue: 'Tap the temple. Joy comes before comfort.' })}
      </TempleEmpty>
    );
  }

  return (
    <>
      <TempleSegments
        label={t('buy-quantity', { defaultValue: 'Buy quantity' })}
        options={BUY_QUANTITIES}
        value={qty}
        onChange={(value) => store().setSourceBuyQty(value)}
      />

      {rows.map((row) => (
        <TempleRow
          key={row.id}
          icon={<Glyph>{row.icon}</Glyph>}
          name={row.name}
          note={row.tagline}
          price={fmt(row.cost, row.format)}
          meta={
            row.owned > 0
              ? // `owned`, not `count`: an i18next `count` interpolation mints a
                // key per plural category, and every locale with a `_many` or
                // `_one` form then reads as an orphan against the English one.
                t('owned-count', { owned: row.owned, defaultValue: 'owned: {{owned}}' })
              : t('base-rate', {
                  rate: fmt(row.rate, row.format),
                  defaultValue: '{{rate}}/s each',
                })
          }
          affordable={row.affordable}
          disabled={!row.affordable}
          onClick={() =>
            row.count === 1
              ? store().buySource(row.id as SourceId)
              : store().buySourceN(row.id as SourceId, row.count)
          }
          ariaLabel={t('buy-source', {
            name: row.name,
            quantity: row.count,
            cost: fmt(row.cost, row.format),
            defaultValue: 'Buy {{quantity}} {{name}} for {{cost}} joy',
          })}
        />
      ))}
    </>
  );
}

/* ─── Upgrades ──────────────────────────────────────────────────────────── */

const PATHS: { value: UpgradePath | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'carnal', label: 'Carnal' },
  { value: 'social', label: 'Social' },
  { value: 'mind', label: 'Mind' },
  { value: 'spirit', label: 'Spirit' },
  { value: 'indulgence', label: 'Indulgence' },
  { value: 'philosophy', label: 'Philosophy' },
  { value: 'offering', label: 'Offering' },
  { value: 'synergy', label: 'Synergy' },
];

function UpgradesPanel({ scrollRef }: { scrollRef: React.RefObject<HTMLDivElement | null> }) {
  const { t } = useTranslation('c-temple-of-joy');
  const filter = useTempleValue((s) => s.upgradePathFilter);

  const available = useTempleSnapshot((s) => {
    const path = s.upgradePathFilter;
    return (
      UPGRADES.filter(
        (u) =>
          !s.upgrades.has(u.id) &&
          (path === 'all' || u.path === path) &&
          computeIsUpgradeVisible(u.id, s),
      )
        .map((u) => {
          const cost = computeUpgradeCost(u.id, s);
          return {
            id: u.id,
            name: u.name,
            flavor: u.flavor,
            cost,
            path: u.path,
            affordable: s.happiness >= cost,
            format: s.numberFormat,
          };
        })
        // Cheapest first: the next thing you can buy should be the next thing
        // you see.
        .sort((a, b) => a.cost - b.cost)
    );
  }, 300);

  const windowed = useWindowedList(available, scrollRef, filter);

  return (
    <>
      <TempleSegments
        label={t('upgrade-path', { defaultValue: 'Upgrade path' })}
        options={PATHS.map((p) => ({
          value: p.value,
          label: t(`path-${p.value}`, { defaultValue: p.label }),
        }))}
        value={filter}
        onChange={(value) => store().setUpgradePathFilter(value)}
      />

      {available.length === 0 ? (
        <TempleEmpty>
          {t('upgrades-empty', { defaultValue: 'Nothing revealed on this path yet.' })}
        </TempleEmpty>
      ) : (
        windowed.map((row) => (
          <TempleRow
            key={row.id}
            name={row.name}
            note={row.flavor}
            price={fmt(row.cost, row.format)}
            meta={t(`path-${row.path}`, { defaultValue: row.path })}
            affordable={row.affordable}
            disabled={!row.affordable}
            onClick={() => store().purchaseUpgrade(row.id)}
            ariaLabel={t('buy-upgrade', {
              name: row.name,
              cost: fmt(row.cost, row.format),
              defaultValue: 'Buy {{name}} for {{cost}} joy',
            })}
          />
        ))
      )}
    </>
  );
}

/* ─── Relics ────────────────────────────────────────────────────────────── */

function RelicsPanel() {
  const { t } = useTranslation('c-temple-of-joy');

  const view = useTempleSnapshot((s) => {
    const hasSlot = s.activeRelics.length < s.maxRelicSlots;
    return {
      slots: `${s.activeRelics.length}/${s.maxRelicSlots}`,
      rows: RELICS.filter((r) => s.activeRelics.includes(r.id) || s.peakKarma >= r.karmaCost * 0.1)
        .sort((a, b) => a.karmaCost - b.karmaCost)
        .map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          karmaCost: r.karmaCost,
          equipped: s.activeRelics.includes(r.id),
          canEquip: hasSlot && s.karma >= r.karmaCost,
        })),
    };
  }, 300);

  if (view.rows.length === 0) {
    return (
      <TempleEmpty>
        {t('relics-empty', { defaultValue: 'Karma accrues to the patient. None yet.' })}
      </TempleEmpty>
    );
  }

  return (
    <>
      <p className="toj-row-note" style={{ marginBottom: '0.75rem' }}>
        {t('relic-slots', { slots: view.slots, defaultValue: 'Relic slots in use: {{slots}}' })}
      </p>
      {view.rows.map((row) => (
        <TempleRow
          key={row.id}
          icon={<Glyph>💍</Glyph>}
          name={row.name}
          note={row.description}
          price={row.equipped ? t('equipped', { defaultValue: 'Equipped' }) : `☯ ${row.karmaCost}`}
          owned={row.equipped}
          affordable={!row.equipped && row.canEquip}
          disabled={!row.equipped && !row.canEquip}
          onClick={() =>
            row.equipped
              ? store().unequipRelic(row.id as RelicId)
              : store().equipRelic(row.id as RelicId)
          }
          ariaLabel={
            row.equipped
              ? t('unequip-relic', { name: row.name, defaultValue: 'Unequip {{name}}' })
              : t('equip-relic', {
                  name: row.name,
                  cost: row.karmaCost,
                  defaultValue: 'Equip {{name}} for {{cost}} karma',
                })
          }
        />
      ))}
    </>
  );
}

/* ─── Wheel ─────────────────────────────────────────────────────────────── */

function WheelPanel() {
  const { t } = useTranslation('c-temple-of-joy');

  const rows = useTempleSnapshot(
    (s) =>
      WHEEL_UPGRADES.filter((w) => {
        const unlocked = !w.requires?.length || w.requires.every((id) => s.wheelPurchased.has(id));
        return s.wheelPurchased.has(w.id) || unlocked;
      }).map((w) => ({
        id: w.id,
        name: w.name,
        description: w.description,
        tier: w.tier,
        shardCost: w.shardCost,
        owned: s.wheelPurchased.has(w.id),
        affordable: s.blissShards >= w.shardCost,
      })),
    300,
  );

  if (rows.length === 0) {
    return (
      <TempleEmpty>
        {t('wheel-empty', { defaultValue: 'The wheel turns only for those who have let go.' })}
      </TempleEmpty>
    );
  }

  return (
    <>
      {rows.map((row) => (
        <TempleRow
          key={row.id}
          icon={<Glyph>🔄</Glyph>}
          name={row.name}
          note={row.description}
          price={row.owned ? t('acquired', { defaultValue: 'Acquired' }) : `💎 ${row.shardCost}`}
          meta={t('tier-n', { tier: row.tier, defaultValue: 'Tier {{tier}}' })}
          owned={row.owned}
          affordable={!row.owned && row.affordable}
          disabled={row.owned || !row.affordable}
          onClick={row.owned ? undefined : () => store().purchaseWheelUpgrade(row.id)}
        />
      ))}
    </>
  );
}

/* ─── Ascension ─────────────────────────────────────────────────────────── */

function AscensionPanel() {
  const { t } = useTranslation('c-temple-of-joy');

  const view = useTempleSnapshot((s) => {
    return {
      canAscend: computeCanAscend(s),
      gain: computeRadianceGain(s),
      required: computeAscensionPrestigeReq(s),
      prestige: s.prestigeCount,
      format: s.numberFormat,
      rows: ASCENSION_UPGRADES.map((u) => ({
        id: u.id,
        name: u.name,
        description: u.description,
        cost: u.cost,
        tier: u.tier,
        owned: s.ascensionUpgrades.has(u.id),
        unlocked: !u.requires || u.requires.every((id) => s.ascensionUpgrades.has(id)),
        affordable: s.radiance >= u.cost,
      })),
    };
  }, 300);

  return (
    <>
      <div className="toj-setting">
        <span className="toj-setting-label">
          <span className="toj-row-name">
            <Glyph>☀️</Glyph> {t('ascend', { defaultValue: 'Ascend' })}
          </span>
          <span className="toj-row-note">
            {t('ascend-progress', {
              have: view.prestige,
              need: view.required,
              defaultValue:
                'Reset the prestige layer for permanent Radiance. {{have}} of {{need}} transcendences.',
            })}
          </span>
        </span>
        <span className="toj-setting-control">
          <span className="toj-row-price">+{fmt(view.gain, view.format)} ☀</span>
          <TempleButton
            variant="gold"
            size="sm"
            disabled={!view.canAscend}
            ready={view.canAscend}
            onClick={() => store().ascend()}
          >
            {t('ascend', { defaultValue: 'Ascend' })}
          </TempleButton>
        </span>
      </div>

      {view.rows.map((row) => (
        <TempleRow
          key={row.id}
          name={row.name}
          note={row.description}
          price={row.owned ? t('acquired', { defaultValue: 'Acquired' }) : `☀ ${row.cost}`}
          meta={t('tier-n', { tier: row.tier, defaultValue: 'Tier {{tier}}' })}
          owned={row.owned}
          locked={!row.unlocked}
          affordable={!row.owned && row.unlocked && row.affordable}
          disabled={row.owned || !row.unlocked || !row.affordable}
          onClick={row.owned ? undefined : () => store().purchaseAscensionUpgrade(row.id)}
        />
      ))}
    </>
  );
}

/* ─── Objectives ────────────────────────────────────────────────────────── */

function ObjectivesPanel() {
  const { t } = useTranslation('c-temple-of-joy');

  const view = useTempleSnapshot(
    (s) => ({
      done: s.completedObjectives.size,
      rows: OBJECTIVES.map((o) => ({
        id: o.id,
        name: o.name,
        description: o.description,
        category: o.category,
        complete: s.completedObjectives.has(o.id),
        reward: [
          o.reward.radiance ? `+${o.reward.radiance}☀` : '',
          o.reward.blissShards ? `+${o.reward.blissShards}💎` : '',
          o.reward.karma ? `+${o.reward.karma}☯` : '',
        ]
          .filter(Boolean)
          .join(' '),
      })),
    }),
    600,
  );

  return (
    <>
      <p className="toj-row-note" style={{ marginBottom: '0.75rem' }}>
        {t('objectives-progress', {
          done: view.done,
          total: OBJECTIVES.length,
          defaultValue: '{{done}} of {{total}} completed',
        })}
      </p>
      {view.rows.map((row) => (
        <TempleRow
          key={row.id}
          icon={<Glyph>{row.complete ? '✅' : '⬜'}</Glyph>}
          name={row.name}
          note={row.description}
          price={row.reward}
          meta={t(`category-${row.category}`, { defaultValue: row.category })}
          owned={row.complete}
        />
      ))}
    </>
  );
}

/* ─── Achievements ──────────────────────────────────────────────────────── */

function AchievementsPanel({ scrollRef }: { scrollRef: React.RefObject<HTMLDivElement | null> }) {
  const { t } = useTranslation('c-temple-of-joy');
  const [showLocked, setShowLocked] = useState(true);

  const earned = useTempleSnapshot((s) => [...s.achievements].join(','), 1000);
  const earnedSet = useMemo(() => new Set(earned.split(',').filter(Boolean)), [earned]);

  const rows = useMemo(
    () =>
      ACHIEVEMENTS.filter((a) => showLocked || earnedSet.has(a.id)).map((a) => ({
        id: a.id,
        got: earnedSet.has(a.id),
        // A hidden achievement's name is the reward for finding it.
        name: earnedSet.has(a.id) || !a.hidden ? a.name : '???',
        description: earnedSet.has(a.id)
          ? a.description
          : a.hidden
            ? t('hidden-achievement', { defaultValue: 'Hidden — you will know it when you do it.' })
            : a.description,
      })),
    [earnedSet, showLocked, t],
  );

  const windowed = useWindowedList(rows, scrollRef, showLocked ? 'all' : 'earned');

  return (
    <>
      <TempleSegments
        label={t('trophy-filter', { defaultValue: 'Trophy filter' })}
        options={[
          { value: 'all', label: t('filter-all', { defaultValue: 'All' }) },
          { value: 'earned', label: t('filter-earned', { defaultValue: 'Earned' }) },
        ]}
        value={showLocked ? 'all' : 'earned'}
        onChange={(value) => setShowLocked(value === 'all')}
      />
      <p className="toj-row-note" style={{ marginBottom: '0.75rem' }}>
        {t('trophies-progress', {
          done: earnedSet.size,
          total: ACHIEVEMENTS.length,
          defaultValue: '{{done}} of {{total}} earned',
        })}
      </p>
      {windowed.map((row) => (
        <TempleRow
          key={row.id}
          icon={<Glyph>{row.got ? '🏆' : '🔒'}</Glyph>}
          name={row.name}
          note={row.description}
          owned={row.got}
          locked={!row.got}
        />
      ))}
    </>
  );
}

/* ─── Settings ──────────────────────────────────────────────────────────── */

function SettingsPanel() {
  const { t } = useTranslation('c-temple-of-joy');
  const settings = useTempleValue((s) => ({
    theme: s.theme,
    numberFormat: s.numberFormat,
    soundEnabled: s.soundEnabled,
    musicVolume: s.musicVolume,
    sfxVolume: s.sfxVolume,
    autoBuyEnabled: s.autoBuyEnabled,
  }));

  return (
    <>
      <Toggle
        label={t('setting-theme', { defaultValue: 'Dawn light' })}
        note={t('setting-theme-note', { defaultValue: 'Trade candlelight for morning sun.' })}
        checked={settings.theme === 'light'}
        onChange={(on) => store().setTheme(on ? 'light' : 'dark')}
      />

      <Toggle
        label={t('setting-sound', { defaultValue: 'Sound' })}
        note={t('setting-sound-note', { defaultValue: 'Bells, chimes and the temple hum.' })}
        checked={settings.soundEnabled}
        onChange={(on) => store().setSoundEnabled(on)}
      />

      <Slider
        label={t('setting-music', { defaultValue: 'Music volume' })}
        value={settings.musicVolume}
        disabled={!settings.soundEnabled}
        onChange={(value) => store().setMusicVolume(value)}
      />

      <Slider
        label={t('setting-sfx', { defaultValue: 'Effects volume' })}
        value={settings.sfxVolume}
        disabled={!settings.soundEnabled}
        onChange={(value) => store().setSfxVolume(value)}
      />

      <Toggle
        label={t('setting-scientific', { defaultValue: 'Scientific notation' })}
        note={t('setting-scientific-note', {
          defaultValue: 'Show 1.24e18 instead of 1.24Qi.',
        })}
        checked={settings.numberFormat === 'scientific'}
        onChange={(on) => store().setNumberFormat(on ? 'scientific' : 'abbreviated')}
      />

      <Toggle
        label={t('setting-autobuy', { defaultValue: 'Auto-buy sources' })}
        note={t('setting-autobuy-note', {
          defaultValue: 'Spend spare joy on the best source available.',
        })}
        checked={settings.autoBuyEnabled}
        onChange={(on) => store().setAutoBuyEnabled(on)}
      />
    </>
  );
}

function Toggle({
  label,
  note,
  checked,
  onChange,
}: {
  label: string;
  note?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="toj-setting">
      <span className="toj-setting-label">
        <span className="toj-row-name">{label}</span>
        {note && <span className="toj-row-note">{note}</span>}
      </span>
      <span className="toj-setting-control">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
      </span>
    </label>
  );
}

function Slider({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="toj-setting">
      <span className="toj-setting-label">
        <span className="toj-row-name">{label}</span>
      </span>
      <span className="toj-setting-control">
        <span className="toj-row-count">{Math.round(value * 100)}%</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={value}
          disabled={disabled}
          // Named directly rather than relying on the wrapping <label>: the
          // text sits two elements deep, which some assistive tech (and the
          // a11y linter) won't walk.
          aria-label={label}
          aria-valuetext={`${Math.round(value * 100)}%`}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </span>
    </label>
  );
}
