'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Book, Skull, Sword, Eye, Crown } from 'lucide-react';
import { ENEMIES, type EnemyDef } from '@/lib/altair/data/enemies';
import { BOSSES, type BossDef } from '@/lib/altair/data/bosses';
import { useAltairMetaStore } from '@/lib/altair/stores/meta-store';
import { asset } from '@/lib/storage/asset';

// Sprite paths (matching sprite-defs.ts)
const ENEMY_SPRITE_PATH: Record<string, string> = {
  shambler: '/sprites/altair/enemies/shambler.png',
  bat: '/sprites/altair/enemies/bat.png',
  skeleton_warrior: '/sprites/altair/enemies/skeleton-warrior.png',
  ghost: '/sprites/altair/enemies/ghost.png',
  werewolf: '/sprites/altair/enemies/werewolf.png',
  cultist: '/sprites/altair/enemies/cultist.png',
  swarm_rat: '/sprites/altair/enemies/swarm-rat.png',
  witch: '/sprites/altair/enemies/witch.png',
  bone_golem: '/sprites/altair/enemies/bone-golem.png',
  shadow: '/sprites/altair/enemies/shadow.png',
  vampire_noble: '/sprites/altair/enemies/vampire-noble.png',
  arcane_construct: '/sprites/altair/enemies/arcane-construct.png',
  plague_bearer: '/sprites/altair/enemies/plague-bearer.png',
  death_knight: '/sprites/altair/enemies/death-knight.png',
  banshee: '/sprites/altair/enemies/banshee.png',
  lich: '/sprites/altair/enemies/lich.png',
};

const BOSS_SPRITE_PATH: Record<string, string> = {
  hollow_king: '/sprites/altair/bosses/hollow-king.png',
  crimson_countess: '/sprites/altair/bosses/crimson-countess.png',
  elder_lich_malachar: '/sprites/altair/bosses/elder-lich.png',
  terminus: '/sprites/altair/bosses/terminus.png',
};

// Rewrite sprite paths to their CDN origin once (no-op without a CDN configured).
for (const m of [ENEMY_SPRITE_PATH, BOSS_SPRITE_PATH]) {
  for (const k in m) m[k] = asset(m[k]);
}

const TIER_COLORS: Record<number, string> = {
  1: 'var(--altair-text-muted)',
  2: 'var(--altair-info)',
  3: 'var(--altair-success)',
  4: 'var(--altair-rare)',
  5: 'var(--altair-warning)',
  6: 'var(--altair-danger)',
};

const TIER_NAMES: Record<number, string> = {
  1: 'Fodder',
  2: 'Threats',
  3: 'Elites',
  4: 'Dangerous',
  5: 'Nightmare',
  6: 'Cataclysm',
};

// Sprite extraction: first frame (top-left 16x16 for enemies, 32x32 for bosses)
function SpritePreview({ src, size, discovered, isBoss }: { src: string; size: number; discovered: boolean; isBoss?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.src = src;
    img.onload = () => {
      const frameSize = isBoss ? 32 : 16;
      ctx.clearRect(0, 0, size, size);
      ctx.imageSmoothingEnabled = false;

      if (!discovered) {
        // Draw silhouette: draw sprite, then overlay with black using source-in composite
        ctx.drawImage(img, 0, 0, frameSize, frameSize, 0, 0, size, size);
        ctx.globalCompositeOperation = 'source-in';
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, size, size);
        ctx.globalCompositeOperation = 'source-over';
      } else {
        ctx.drawImage(img, 0, 0, frameSize, frameSize, 0, 0, size, size);
      }
    };
  }, [src, size, discovered, isBoss]);

  return <canvas ref={canvasRef} width={size} height={size} className="block" />;
}

type Tab = 'enemies' | 'bosses';

interface BestiaryScreenProps {
  onBack: () => void;
}

export default function BestiaryScreen({ onBack }: BestiaryScreenProps) {
  const { t } = useTranslation("c-altair");
  const [tab, setTab] = useState<Tab>('enemies');
  const [selectedEnemy, setSelectedEnemy] = useState<string | null>(null);
  const bestiary = useAltairMetaStore((s) => s.bestiary);

  const discovered = (id: string) => !!bestiary[id] && bestiary[id].encountered > 0;

  const totalEnemies = ENEMIES.length;
  const discoveredEnemies = ENEMIES.filter((e) => discovered(e.id)).length;
  const totalBosses = BOSSES.length;
  const discoveredBosses = BOSSES.filter((b) => discovered(b.id)).length;

  return (
    <div className="altair-parchment flex flex-col items-center min-h-[calc(100vh-56px)] px-4 py-8">
      <div className="w-full max-w-2xl flex flex-col gap-4">
        {/* Title */}
        <div className="text-center">
          <h1
            className="text-3xl font-black tracking-wider text-(--altair-accent) mb-1"
            style={{ fontFamily: 'var(--altair-font-display)' }}
          >
            <Book size={28} className="inline-block mr-2 -mt-1" />
            {t("bestiary-title", { defaultValue: "BESTIARY" })}
          </h1>
          <p className="text-(--altair-text-muted) text-xs">
            {t("creatures-discovered", { defaultValue: "{{discovered}}/{{total}} creatures discovered", discovered: discoveredEnemies + discoveredBosses, total: totalEnemies + totalBosses })}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1.5">
          <button
            onClick={() => { setTab('enemies'); setSelectedEnemy(null); }}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-colors ${
              tab === 'enemies'
                ? 'bg-(--altair-accent) text-white'
                : 'bg-(--altair-surface) text-(--altair-text-muted) hover:bg-(--altair-surface-hover) border border-(--altair-border)'
            }`}
          >
            <span className="block font-bold">{t("tab-enemies", { defaultValue: "Enemies" })}</span>
            <span className="block text-[10px] opacity-80 mt-0.5">{t("tab-discovered-count", { defaultValue: "{{discovered}}/{{total}} discovered", discovered: discoveredEnemies, total: totalEnemies })}</span>
          </button>
          <button
            onClick={() => { setTab('bosses'); setSelectedEnemy(null); }}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-colors ${
              tab === 'bosses'
                ? 'bg-(--altair-accent) text-white'
                : 'bg-(--altair-surface) text-(--altair-text-muted) hover:bg-(--altair-surface-hover) border border-(--altair-border)'
            }`}
          >
            <span className="block font-bold">{t("tab-bosses", { defaultValue: "Bosses" })}</span>
            <span className="block text-[10px] opacity-80 mt-0.5">{t("tab-discovered-count", { defaultValue: "{{discovered}}/{{total}} discovered", discovered: discoveredBosses, total: totalBosses })}</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1">
          {tab === 'enemies' && (
            <EnemyGrid
              selectedId={selectedEnemy}
              onSelect={setSelectedEnemy}
              bestiary={bestiary}
            />
          )}
          {tab === 'bosses' && (
            <BossGrid
              selectedId={selectedEnemy}
              onSelect={setSelectedEnemy}
              bestiary={bestiary}
            />
          )}
        </div>

        {/* Back button */}
        <button
          onClick={onBack}
          data-altair-sfx="menu_back"
          className="mt-4 py-3 rounded-xl font-semibold text-(--altair-text) bg-(--altair-surface) border border-(--altair-border) hover:bg-(--altair-surface-hover) transition-colors"
        >
          {t("back", { defaultValue: "Back" })}
        </button>
      </div>
    </div>
  );
}

function EnemyGrid({
  selectedId,
  onSelect,
  bestiary,
}: {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  bestiary: Record<string, { encountered: number; killed: number; killedBy: number }>;
}) {
  const { t } = useTranslation("c-altair");
  const discovered = (id: string) => !!bestiary[id] && bestiary[id].encountered > 0;
  const tiers = [1, 2, 3, 4, 5, 6] as const;

  return (
    <div className="space-y-4">
      {tiers.map((tier) => {
        const enemies = ENEMIES.filter((e) => e.tier === tier);
        if (enemies.length === 0) return null;
        return (
          <div key={tier}>
            <div className="flex items-center gap-2 mb-2">
              <Skull size={14} style={{ color: TIER_COLORS[tier] }} />
              <h3 className="text-sm font-bold" style={{ color: TIER_COLORS[tier] }}>
                {t("tier-heading", { defaultValue: "Tier {{tier}} — {{name}}", tier, name: TIER_NAMES[tier] })}
              </h3>
              <div className="flex-1 h-px bg-(--altair-border)" />
            </div>

            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {enemies.map((enemy) => (
                <EnemyCard
                  key={enemy.id}
                  enemy={enemy}
                  discovered={discovered(enemy.id)}
                  selected={selectedId === enemy.id}
                  stats={bestiary[enemy.id]}
                  onClick={() => onSelect(selectedId === enemy.id ? null : enemy.id)}
                />
              ))}
            </div>

            {selectedId && enemies.some((e) => e.id === selectedId) && (
              <EnemyDetail
                enemy={enemies.find((e) => e.id === selectedId)!}
                discovered={discovered(selectedId)}
                stats={bestiary[selectedId]}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function EnemyCard({
  enemy,
  discovered,
  selected,
  stats,
  onClick,
}: {
  enemy: EnemyDef;
  discovered: boolean;
  selected: boolean;
  stats?: { encountered: number; killed: number; killedBy: number };
  onClick: () => void;
}) {
  const { t } = useTranslation("c-altair");
  const spriteSrc = ENEMY_SPRITE_PATH[enemy.id];

  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition-all ${
        selected
          ? 'border-(--altair-accent) bg-(--altair-accent)/10'
          : discovered
            ? 'border-(--altair-border) bg-(--altair-surface) hover:border-(--altair-border-bright)'
            : 'border-(--altair-border)/30 bg-(--altair-surface)/50 opacity-60 hover:opacity-80'
      }`}
    >
      {spriteSrc ? (
        <SpritePreview src={spriteSrc} size={40} discovered={discovered} />
      ) : (
        <div className="w-10 h-10 rounded bg-(--altair-bg) flex items-center justify-center">
          <Skull size={20} className="text-(--altair-text-dim)" />
        </div>
      )}
      <span className="text-[10px] font-semibold text-(--altair-text) truncate w-full text-center">
        {discovered ? enemy.name : '???'}
      </span>
      {discovered && stats && stats.killed > 0 && (
        <span className="text-[9px] text-(--altair-text-dim)">{t("kills-count", { defaultValue: "{{count}} kills", count: stats.killed })}</span>
      )}
    </button>
  );
}

function EnemyDetail({
  enemy,
  discovered,
  stats,
}: {
  enemy: EnemyDef;
  discovered: boolean;
  stats?: { encountered: number; killed: number; killedBy: number };
}) {
  const { t } = useTranslation("c-altair");
  if (!discovered) {
    return (
      <div className="mt-2 p-3 rounded-lg bg-(--altair-surface) border border-(--altair-border)/50 text-center text-(--altair-text-dim) text-xs">
        {t("enemy-undiscovered", { defaultValue: "Undiscovered — encounter this enemy to learn more." })}
      </div>
    );
  }

  const s = stats || { encountered: 0, killed: 0, killedBy: 0 };

  return (
    <div className="mt-2 p-3 rounded-lg bg-(--altair-surface) border border-(--altair-border)/50 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold text-(--altair-text)">{enemy.name}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ backgroundColor: `${TIER_COLORS[enemy.tier]}22`, color: TIER_COLORS[enemy.tier] }}>
          {t("tier-badge", { defaultValue: "Tier {{tier}}", tier: enemy.tier })}
        </span>
      </div>
      <p className="text-xs text-(--altair-text-muted) leading-relaxed">{enemy.description}</p>
      <div className="flex gap-4 text-xs">
        <div className="flex items-center gap-1 text-(--altair-text-muted)">
          <Eye size={12} />
          <span>{t("stat-encountered", { defaultValue: "{{count}} encountered", count: s.encountered.toLocaleString() })}</span>
        </div>
        <div className="flex items-center gap-1 text-(--altair-success)">
          <Sword size={12} />
          <span>{t("stat-killed", { defaultValue: "{{count}} killed", count: s.killed.toLocaleString() })}</span>
        </div>
        <div className="flex items-center gap-1 text-(--altair-danger)">
          <Skull size={12} />
          <span>{t("stat-deaths", { defaultValue: "{{count}} deaths", count: s.killedBy })}</span>
        </div>
      </div>
      <div className="flex gap-3 text-[10px] text-(--altair-text-dim)">
        <span>{t("stat-hp", { defaultValue: "HP: {{value}}", value: enemy.baseHp })}</span>
        <span>{t("stat-dmg", { defaultValue: "DMG: {{value}}", value: enemy.baseDamage })}</span>
        <span>{t("stat-speed", { defaultValue: "Speed: {{value}}", value: enemy.baseSpeed })}</span>
        <span>{t("stat-xp", { defaultValue: "XP: {{value}}", value: enemy.xpDrop })}</span>
      </div>
    </div>
  );
}

function BossGrid({
  selectedId,
  onSelect,
  bestiary,
}: {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  bestiary: Record<string, { encountered: number; killed: number; killedBy: number }>;
}) {
  const discovered = (id: string) => !!bestiary[id] && bestiary[id].encountered > 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {BOSSES.map((boss) => (
          <BossCard
            key={boss.id}
            boss={boss}
            discovered={discovered(boss.id)}
            selected={selectedId === boss.id}
            stats={bestiary[boss.id]}
            onClick={() => onSelect(selectedId === boss.id ? null : boss.id)}
          />
        ))}
      </div>

      {selectedId && BOSSES.some((b) => b.id === selectedId) && (
        <BossDetail
          boss={BOSSES.find((b) => b.id === selectedId)!}
          discovered={discovered(selectedId)}
          stats={bestiary[selectedId]}
        />
      )}
    </div>
  );
}

function BossCard({
  boss,
  discovered,
  selected,
  stats,
  onClick,
}: {
  boss: BossDef;
  discovered: boolean;
  selected: boolean;
  stats?: { encountered: number; killed: number; killedBy: number };
  onClick: () => void;
}) {
  const { t } = useTranslation("c-altair");
  const spriteSrc = BOSS_SPRITE_PATH[boss.id];

  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-all ${
        selected
          ? 'border-(--altair-accent) bg-(--altair-accent)/10'
          : discovered
            ? 'border-(--altair-border) bg-(--altair-surface) hover:border-(--altair-border-bright)'
            : 'border-(--altair-border)/30 bg-(--altair-surface)/50 opacity-60 hover:opacity-80'
      }`}
    >
      {spriteSrc ? (
        <SpritePreview src={spriteSrc} size={56} discovered={discovered} isBoss />
      ) : (
        <div className="w-14 h-14 rounded bg-(--altair-bg) flex items-center justify-center">
          <Crown size={24} className="text-(--altair-text-dim)" />
        </div>
      )}
      <span className="text-xs font-bold text-(--altair-text) truncate w-full text-center">
        {discovered ? boss.name : '???'}
      </span>
      <span className="text-[10px] text-(--altair-text-dim)">
        {discovered ? `${Math.floor(boss.spawnTime / 60)}:${(boss.spawnTime % 60).toString().padStart(2, '0')}` : '??:??'}
      </span>
      {discovered && stats && stats.killed > 0 && (
        <span className="text-[9px] text-(--altair-success)">{t("defeated-count", { defaultValue: "{{count}} defeated", count: stats.killed })}</span>
      )}
    </button>
  );
}

function BossDetail({
  boss,
  discovered,
  stats,
}: {
  boss: BossDef;
  discovered: boolean;
  stats?: { encountered: number; killed: number; killedBy: number };
}) {
  const { t } = useTranslation("c-altair");
  if (!discovered) {
    return (
      <div className="p-3 rounded-lg bg-(--altair-surface) border border-(--altair-border)/50 text-center text-(--altair-text-dim) text-xs">
        {t("boss-undiscovered", { defaultValue: "Undiscovered — survive long enough to encounter this boss." })}
      </div>
    );
  }

  const s = stats || { encountered: 0, killed: 0, killedBy: 0 };

  return (
    <div className="p-3 rounded-lg bg-(--altair-surface) border border-(--altair-border)/50 space-y-2">
      <div className="flex items-center gap-2">
        <Crown size={14} className="text-(--altair-warning)" />
        <span className="text-sm font-bold text-(--altair-text)">{boss.name}</span>
        <span className="text-[10px] text-(--altair-text-dim)">
          {t("boss-spawns-at", { defaultValue: "Spawns at {{time}}", time: `${Math.floor(boss.spawnTime / 60)}:${(boss.spawnTime % 60).toString().padStart(2, '0')}` })}
        </span>
      </div>
      <p className="text-xs text-(--altair-text-muted) leading-relaxed">{boss.description}</p>
      <div className="flex gap-4 text-xs">
        <div className="flex items-center gap-1 text-(--altair-text-muted)">
          <Eye size={12} />
          <span>{t("stat-encountered", { defaultValue: "{{count}} encountered", count: s.encountered.toLocaleString() })}</span>
        </div>
        <div className="flex items-center gap-1 text-(--altair-success)">
          <Sword size={12} />
          <span>{t("stat-boss-defeated", { defaultValue: "{{count}} defeated", count: s.killed.toLocaleString() })}</span>
        </div>
        <div className="flex items-center gap-1 text-(--altair-danger)">
          <Skull size={12} />
          <span>{t("stat-deaths", { defaultValue: "{{count}} deaths", count: s.killedBy })}</span>
        </div>
      </div>
      <div className="flex gap-3 text-[10px] text-(--altair-text-dim)">
        <span>{t("stat-hp", { defaultValue: "HP: {{value}}", value: boss.baseHp })}</span>
        <span>{t("stat-speed", { defaultValue: "Speed: {{value}}", value: boss.baseSpeed })}</span>
        <span>{t("stat-armor", { defaultValue: "Armor: {{value}}", value: boss.armor })}</span>
        <span>{t("stat-phases", { defaultValue: "Phases: {{value}}", value: boss.phases.length })}</span>
      </div>
    </div>
  );
}
