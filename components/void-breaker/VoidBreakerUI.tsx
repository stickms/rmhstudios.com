'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Play, RotateCcw, Trophy, Volume2, VolumeX, BookOpen, ArrowLeft, Settings, Gamepad2, Hexagon } from 'lucide-react';
import {
  META_NODES, nodeCost, nodeLevel, canBuy,
  type MetaState, type MetaNodeId,
} from '@/lib/void-breaker/metaProgression';
import { CHARACTERS, getCharacter, type CharacterId } from '@/lib/void-breaker/characters';
import { authClient } from '@/lib/auth-client';
import { useNavigate } from '@tanstack/react-router';
import type { RunStats } from '@/lib/void-breaker/types';

type LBEntry = { username: string; highScore: number };

export function VoidBreakerUI({
  uiState, runStats, onStartGame, onGoToMenu, muted, onToggleMute,
  musicVolume, onMusicVolumeChange, sfxVolume, onSfxVolumeChange,
  use3D, onSetRenderer,
  reducedFx, onSetReducedFx,
  characterId, onSelectCharacter,
  meta, onBuyNode, earnedCores,
  saveInfo, onClearSave, onContinueGame,
}: {
  uiState: 'menu' | 'playing' | 'gameOver';
  runStats: RunStats | null;
  onStartGame: () => void;
  onGoToMenu: () => void;
  muted: boolean;
  onToggleMute: () => void;
  musicVolume: number;
  onMusicVolumeChange: (v: number) => void;
  sfxVolume: number;
  onSfxVolumeChange: (v: number) => void;
  use3D: boolean;
  onSetRenderer: (to3D: boolean) => void;
  reducedFx: boolean;
  onSetReducedFx: (on: boolean) => void;
  characterId: CharacterId;
  onSelectCharacter: (id: CharacterId) => void;
  meta: MetaState;
  onBuyNode: (id: MetaNodeId) => void;
  earnedCores: number;
  saveInfo: { wave: number; savedAt: Date; score?: number } | null;
  onClearSave: () => void;
  onContinueGame?: () => void;
}) {
  const { t } = useTranslation("c-void-breaker");
  const [lb, setLb] = useState<LBEntry[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [showLore, setShowLore] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showForge, setShowForge] = useState(false);
  const session = authClient.useSession();
  const navigate = useNavigate();

  const fetchLb = useCallback(async () => {
    try {
      const res = await fetch('/api/void-breaker/leaderboard');
      if (!res.ok) return;
      const data = await res.json();
      setLb(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (uiState === 'menu' || uiState === 'gameOver') fetchLb();
    if (uiState === 'menu') setShowLore(false);
    if (uiState === 'menu') setShowSettings(false);
    if (uiState === 'menu') setShowHelp(false);
    if (uiState === 'menu') setShowForge(false);
  }, [uiState, fetchLb]);

  useEffect(() => {
    if (uiState !== 'gameOver' || !runStats || submitted || !session.data) return;
    const username = session.data.user.name ||
      (session.data.user as unknown as Record<string, string>).username || 'Killer';
    setSubmitted(true);
    (async () => {
      try {
        await fetch('/api/void-breaker/score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username, score: runStats.score, wave: runStats.wave,
            enemiesKilled: runStats.enemiesKilled, timeMs: runStats.timeSurvivedMs,
          }),
        });
        fetchLb();
      } catch { /* ignore */ }
    })();
  }, [uiState, runStats, submitted, session.data, fetchLb]);

  useEffect(() => {
    if (uiState === 'playing') setSubmitted(false);
  }, [uiState]);

  if (uiState === 'playing') return null;

  // ── Settings Screen ──
  if (showSettings) {
    return (
      <div className="absolute inset-0 z-40 pointer-events-auto overflow-y-auto bg-[#0d0d14]">
        <div className="max-w-sm mx-auto px-6 py-10 space-y-6">
          <button onClick={() => setShowSettings(false)}
            className="flex items-center gap-1.5 text-zinc-500 hover:text-[#d4af37] text-sm transition-colors mb-4">
            <ArrowLeft className="w-4 h-4" /> {t("back", { defaultValue: "Back" })}
          </button>

          <h2 className="text-xl font-bold text-[#d4af37] flex items-center gap-2">
            <Settings className="w-5 h-5" /> {t("settings", { defaultValue: "Settings" })}
          </h2>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm text-zinc-400">{t("music-volume", { defaultValue: "Music Volume" })}</label>
                <span className="text-xs text-[#d4af37] font-mono tabular-nums">{musicVolume}%</span>
              </div>
              <Slider
                value={[musicVolume]}
                onValueChange={([v]) => onMusicVolumeChange(v)}
                min={0}
                max={100}
                step={5}
                className="w-full"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm text-zinc-400">{t("sfx-volume", { defaultValue: "Sound Effects" })}</label>
                <span className="text-xs text-[#d4af37] font-mono tabular-nums">{sfxVolume}%</span>
              </div>
              <Slider
                value={[sfxVolume]}
                onValueChange={([v]) => onSfxVolumeChange(v)}
                min={0}
                max={100}
                step={5}
                className="w-full"
              />
            </div>

            <div>
              <label className="text-sm text-zinc-400">{t("renderer", { defaultValue: "Renderer" })}</label>
              <div className="flex gap-2 mt-2">
                <Button onClick={() => onSetRenderer(true)}
                  className={`flex-1 ${use3D ? 'bg-[#00f5ff]/15 text-[#00f5ff] border border-[#00f5ff]/50' : 'bg-[#1a1a24] text-zinc-400 border border-[#2a2a3a]'}`}>
                  {t("renderer-3d", { defaultValue: "3D" })}
                </Button>
                <Button onClick={() => onSetRenderer(false)}
                  className={`flex-1 ${!use3D ? 'bg-[#d4af37]/15 text-[#d4af37] border border-[#c9a227]/50' : 'bg-[#1a1a24] text-zinc-400 border border-[#2a2a3a]'}`}>
                  {t("renderer-2d", { defaultValue: "2D" })}
                </Button>
              </div>
              <p className="text-[10px] text-zinc-600 font-mono mt-1.5">
                {t("renderer-note", { defaultValue: "Switching reloads the page." })}
              </p>
            </div>

            <div>
              <label className="text-sm text-zinc-400">{t("reduced-effects", { defaultValue: "Reduced Effects" })}</label>
              <div className="flex gap-2 mt-2">
                <Button onClick={() => onSetReducedFx(false)}
                  className={`flex-1 ${!reducedFx ? 'bg-[#00f5ff]/15 text-[#00f5ff] border border-[#00f5ff]/50' : 'bg-[#1a1a24] text-zinc-400 border border-[#2a2a3a]'}`}>
                  {t("fx-full", { defaultValue: "Full" })}
                </Button>
                <Button onClick={() => onSetReducedFx(true)}
                  className={`flex-1 ${reducedFx ? 'bg-[#00ff88]/15 text-[#00ff88] border border-[#00ff88]/50' : 'bg-[#1a1a24] text-zinc-400 border border-[#2a2a3a]'}`}>
                  {t("fx-reduced", { defaultValue: "Reduced" })}
                </Button>
              </div>
              <p className="text-[10px] text-zinc-600 font-mono mt-1.5">
                {t("reduced-effects-note", { defaultValue: "Less shake, flashing, and chromatic aberration." })}
              </p>
            </div>
          </div>

          <Button onClick={() => setShowSettings(false)}
            className="w-full bg-[#1a1a24] hover:bg-[#252530] text-[#d4af37] border border-[#c9a227]/40">
            {t("done", { defaultValue: "Done" })}
          </Button>
        </div>
      </div>
    );
  }

  // ── Void Forge (meta-progression) ──
  if (showForge) {
    return (
      <div className="absolute inset-0 z-40 pointer-events-auto overflow-y-auto bg-[#0d0d14]">
        <div className="max-w-md mx-auto px-6 py-10 space-y-5">
          <button onClick={() => setShowForge(false)}
            className="flex items-center gap-1.5 text-zinc-500 hover:text-[#d4af37] text-sm transition-colors">
            <ArrowLeft className="w-4 h-4" /> {t("back", { defaultValue: "Back" })}
          </button>

          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-[#d4af37] flex items-center gap-2">
              <Hexagon className="w-5 h-5" /> {t("void-forge", { defaultValue: "Void Forge" })}
            </h2>
            <div className="text-[#d4af37] font-mono font-bold text-sm">
              ◈ {meta.cores.toLocaleString()}
            </div>
          </div>
          <p className="text-[11px] text-zinc-500 -mt-2">
            {t("forge-blurb", { defaultValue: "Spend Void Cores on permanent upgrades. Cores are earned every run." })}
          </p>

          <div className="space-y-2">
            {META_NODES.map((n) => {
              const lvl = nodeLevel(meta, n.id);
              const maxed = lvl >= n.maxLevel;
              const cost = nodeCost(n, lvl);
              const affordable = canBuy(meta, n.id);
              return (
                <div key={n.id} className="bg-[#1a1a24] border border-[#2a2a3a] rounded-lg p-3 flex items-center gap-3">
                  <div className="text-2xl w-7 text-center shrink-0" style={{ color: n.color }}>{n.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold font-mono text-sm" style={{ color: n.color }}>{n.name}</span>
                      <span className="text-[9px] font-mono text-zinc-500">{t("forge-lvl", { defaultValue: "LV {{lvl}}/{{max}}", lvl, max: n.maxLevel })}</span>
                    </div>
                    <div className="text-[11px] text-zinc-400 leading-snug">{n.description}</div>
                    <div className="flex gap-1 mt-1">
                      {Array.from({ length: n.maxLevel }, (_, i) => (
                        <div key={i} className="h-1 flex-1 rounded-full" style={{ background: i < lvl ? n.color : '#2a2a3a' }} />
                      ))}
                    </div>
                  </div>
                  <Button
                    onClick={() => onBuyNode(n.id)}
                    disabled={maxed || !affordable}
                    className={`shrink-0 text-xs font-mono px-3 ${maxed
                      ? 'bg-[#1a1a24] text-zinc-600 border border-[#2a2a3a]'
                      : affordable
                        ? 'bg-[#d4af37]/15 text-[#d4af37] border border-[#c9a227]/50 hover:bg-[#d4af37]/25'
                        : 'bg-[#1a1a24] text-zinc-600 border border-[#2a2a3a]'}`}>
                    {maxed ? t("forge-max", { defaultValue: "MAX" }) : `◈ ${cost}`}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── How to Play ──
  if (showHelp) {
    const controls: [string, string][] = [
      ['WASD / Arrows', t('hp-move', { defaultValue: 'Move' })],
      ['Mouse', t('hp-aim', { defaultValue: 'Aim (you auto-fire)' })],
      ['Shift', t('hp-dash', { defaultValue: 'Dash — brief invincibility' })],
      ['F', t('hp-focus', { defaultValue: 'Focus — slow time, bonus shards' })],
      ['Space', t('hp-detonate', { defaultValue: 'Void Burst (needs 5+ shards)' })],
      ['Q / E / R / T', t('hp-abilities', { defaultValue: 'Abilities — unlock as you progress' })],
      ['Esc', t('hp-pause', { defaultValue: 'Pause' })],
    ];
    const tips: [string, string][] = [
      [t('hp-shards-title', { defaultValue: 'Shards' }), t('hp-shards', { defaultValue: 'Collected shards orbit you as a shield AND raise your score multiplier. Hoard them — but spend them.' })],
      [t('hp-burst-title', { defaultValue: 'Void Burst + Surge' }), t('hp-burst', { defaultValue: 'Detonating deals more damage the more shards you hold, and banks your multiplier as a decaying Surge — so blowing your ring is a power spike, not a reset.' })],
      [t('hp-upgrades-title', { defaultValue: 'Upgrades' }), t('hp-upgrades', { defaultValue: 'Clear a wave, pick 1 of 3 upgrade cards. They stack — build your run.' })],
      [t('hp-enemies-title', { defaultValue: 'Read the enemies' }), t('hp-enemies', { defaultValue: 'Dodge a sniper’s aim-line by moving. Flank a shielded foe (its arc blocks frontal shots) or hit it with a burst. Kill healers first.' })],
      [t('hp-bosses-title', { defaultValue: 'Bosses' }), t('hp-bosses', { defaultValue: 'Every 5th wave. Each has its own tricks — rotating beams, collapsing walls, inverted controls, and worse.' })],
    ];
    return (
      <div className="absolute inset-0 z-40 pointer-events-auto overflow-y-auto bg-[#0d0d14]">
        <div className="max-w-lg mx-auto px-6 py-10 space-y-6">
          <button onClick={() => setShowHelp(false)}
            className="flex items-center gap-1.5 text-zinc-500 hover:text-[#d4af37] text-sm transition-colors mb-2">
            <ArrowLeft className="w-4 h-4" /> {t("back", { defaultValue: "Back" })}
          </button>

          <h2 className="text-xl font-bold text-[#d4af37] flex items-center gap-2">
            <Gamepad2 className="w-5 h-5" /> {t("how-to-play", { defaultValue: "How to Play" })}
          </h2>

          <div className="bg-[#1a1a24] border border-[#c9a227]/20 rounded-lg p-4">
            <div className="text-[10px] text-[#c9a227]/80 font-bold uppercase tracking-[0.15em] mb-3">{t("controls", { defaultValue: "Controls" })}</div>
            <div className="space-y-1.5">
              {controls.map(([key, desc]) => (
                <div key={key} className="flex justify-between items-baseline gap-3 text-sm">
                  <span className="font-mono text-[#00f5ff] text-xs shrink-0">{key}</span>
                  <span className="text-zinc-400 text-right">{desc}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {tips.map(([title, body]) => (
              <div key={title} className="bg-[#0a0a18] border border-[#c9a227]/15 rounded-lg p-3">
                <div className="text-[#d4af37]/90 font-bold text-xs uppercase tracking-widest mb-1">{title}</div>
                <p className="text-zinc-400 text-sm leading-relaxed font-light">{body}</p>
              </div>
            ))}
          </div>

          <Button onClick={() => setShowHelp(false)}
            className="w-full bg-[#1a1a24] hover:bg-[#252530] text-[#d4af37] border border-[#c9a227]/40">
            {t("done", { defaultValue: "Done" })}
          </Button>
        </div>
      </div>
    );
  }

  // ── Lore Screen ── (obsidian & gold)
  if (showLore) {
    return (
      <div className="absolute inset-0 z-40 pointer-events-auto overflow-y-auto bg-[#0d0d14]">
        <div className="max-w-2xl mx-auto px-6 py-10 space-y-6">
          <button onClick={() => setShowLore(false)}
            className="flex items-center gap-1.5 text-zinc-500 hover:text-[#d4af37] text-sm transition-colors mb-4">
            <ArrowLeft className="w-4 h-4" /> {t("back", { defaultValue: "Back" })}
          </button>

          <div className="text-center space-y-2">
            <div className="text-[10px] tracking-[0.5em] text-orange-700/60 font-mono uppercase">
              {'\u58ae\u843d\u5929\u4f7f'} {'\u00b7'} Void Chronicle
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-[#d4af37]">
              THE FALL OF KAI CHEN
            </h2>
          </div>

          <div className="space-y-4 text-zinc-400 text-sm leading-relaxed font-light">
            <p className="text-zinc-300 text-base italic border-l-2 border-[#c9a227]/40 pl-4">
              &quot;The rain never stops in the void zones. They say it&apos;s the dead dimension crying.&quot;
            </p>

            <div className="space-y-1">
              <h3 className="text-[#d4af37]/90 font-bold text-xs uppercase tracking-widest">Hong Kong, 2047</h3>
              <p>
                Beneath the neon towers of Kowloon, a dimensional rift split open like a wound in reality.
                The government called it the Collapse. Scientists called it a quantum bridge.
                The people of Chungking Mansions, who watched their neighbors dissolve into light, called it the Void.
              </p>
            </div>

            <p>
              The rift leaked entities &mdash; fragments of a dead parallel universe, drawn to living consciousness
              like moths to a flame. They came in waves, each breach larger than the last. The military cordoned
              the district. The rain turned permanent, tinted purple by the dimensional bleed.
              Nobody could explain the rain.
            </p>

            <div className="space-y-1">
              <h3 className="text-[#d4af37]/90 font-bold text-xs uppercase tracking-widest">{'\u9648\u51ef'} &mdash; Kai Chen</h3>
              <p>
                You were a Triad enforcer. Not a good man. Not the worst either. Just someone who understood
                that survival in Kowloon meant knowing when to fight and when to fold.
              </p>
              <p>
                On the night of the first breach, you were in Chungking Mansions collecting a debt.
                The void tore through the building. Your crew &mdash; six men &mdash; were consumed in seconds.
                You survived because the void shards bonded to your body instead of destroying it.
                Nobody knows why. You don&apos;t ask anymore.
              </p>
            </div>

            <p>
              The shards gave you two gifts: the ability to absorb dimensional fragments as raw power,
              and the curse of seeing the dead dimension bleed through into reality. Every neon sign
              flickers with ghost-light. Every puddle reflects a sky that doesn&apos;t exist.
              You see it all. It never stops.
            </p>

            <div className="space-y-1">
              <h3 className="text-[#d4af37]/90 font-bold text-xs uppercase tracking-widest">The Void Breaker</h3>
              <p>
                Now you patrol the sealed zones alone. You are a void breaker &mdash; the last line between
                the rift and the city. Every wave is another breach. Every shard you collect is a piece of
                a dead universe clinging to you, orbiting your body like a shield of stolen light.
              </p>
              <p>
                When the shards reach critical mass, you can detonate them &mdash; a Void Burst that shatters
                reality in a sphere around you. The more shards you spend, the deadlier the blast &mdash; and the
                power you release lingers as a Surge before it fades. Hold for the shield, or burn it all to survive.
              </p>
            </div>

            <p className="text-zinc-300 italic border-l-2 border-[#c9a227]/40 pl-4">
              Every fifth breach, something larger comes through. The locals call them {'\u58ae\u843d\u5929\u4f7f'} &mdash;
              Fallen Angels. Massive entities from the dead dimension, carrying the memory of what they once were.
              They do not go quietly.
            </p>

            <div className="space-y-1">
              <h3 className="text-[#d4af37]/90 font-bold text-xs uppercase tracking-widest">Focus</h3>
              <p>
                The shards did something else to you. They slowed your perception of time.
                In moments of extreme concentration, the world crawls to a fraction of its speed.
                Rain hangs in the air. Enemy projectiles drift like lazy fireflies.
                You call it Focus. It lasts seconds. It feels like hours.
                It&apos;s the closest you&apos;ve felt to peace since the Collapse.
              </p>
            </div>

            <p className="text-center text-zinc-600 text-xs mt-6">
              {'\u2014'} Kowloon Sealed Zone Report, File #{'\u00b7'}VB-2047-{'\u03a9'} {'\u2014'}
            </p>
          </div>

          <div className="text-center pt-4">
            <Button onClick={() => { setShowLore(false); }}
              className="px-8 py-2 font-bold bg-[#1a1a24] hover:bg-[#252530] border border-[#c9a227]/40 text-[#d4af37]">
              {t("return", { defaultValue: "Return" })}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Menu ── (obsidian & gold)
  if (uiState === 'menu') {
    return (
      <div className="absolute inset-0 z-40 pointer-events-auto overflow-hidden bg-[#0d0d14]">
        <div className="relative h-full flex items-center justify-center overflow-y-auto py-8">
          <div className="text-center space-y-4 sm:space-y-5 w-full max-w-md px-4 py-6">
            <div className="absolute top-4 right-4 flex items-center gap-2">
              <button onClick={() => setShowSettings(true)}
                className="w-9 h-9 rounded-full bg-[#1a1a24] border border-[#c9a227]/30 flex items-center justify-center hover:bg-[#252530] transition-colors">
                <Settings className="w-4 h-4 text-[#d4af37]" />
              </button>
              <button onClick={onToggleMute}
                className="w-9 h-9 rounded-full bg-[#1a1a24] border border-[#c9a227]/30 flex items-center justify-center hover:bg-[#252530] transition-colors">
                {muted ? <VolumeX className="w-4 h-4 text-zinc-600" /> : <Volume2 className="w-4 h-4 text-[#d4af37]" />}
              </button>
            </div>

            <div className="space-y-1.5">
              <h1 className="text-4xl sm:text-6xl font-black tracking-tighter text-[#d4af37] drop-shadow-[0_0_20px_rgba(212,175,55,0.3)]">
                VOID BREAKER
              </h1>
              <div className="text-[10px] tracking-[0.2em] text-zinc-500 font-mono">
                {t("tagline", { defaultValue: "Obsidian Arena Shooter" })}
              </div>
            </div>

            <p className="text-zinc-500 text-xs leading-relaxed max-w-xs mx-auto">
              {t("instructions", { defaultValue: "Collect shards. Dash. Focus to slow time. Detonate when overwhelmed. Survive the waves." })}
            </p>

            {/* Voidrunner (character) picker */}
            <div className="bg-[#0a0a18] border border-[#00f5ff]/15 rounded-lg p-2.5 text-left">
              <div className="text-[9px] text-[#00f5ff]/60 font-mono mb-2 tracking-[0.2em] uppercase">
                {t("voidrunner", { defaultValue: "Voidrunner" })}
              </div>
              <div className="flex gap-1.5">
                {CHARACTERS.map((c) => {
                  const sel = c.id === characterId;
                  return (
                    <button key={c.id} onClick={() => onSelectCharacter(c.id)}
                      className={`flex-1 rounded-lg py-2 border flex flex-col items-center gap-0.5 transition-all ${sel ? '' : 'opacity-50 hover:opacity-90'}`}
                      style={{ borderColor: sel ? c.color : '#2a2a3a', background: sel ? c.color + '18' : 'transparent' }}>
                      <span className="text-lg leading-none" style={{ color: c.color }}>{c.icon}</span>
                      <span className="text-[9px] font-mono" style={{ color: sel ? c.color : '#888' }}>{c.name}</span>
                    </button>
                  );
                })}
              </div>
              <div className="text-[10px] text-zinc-400 mt-2 leading-snug min-h-[28px]">
                {getCharacter(characterId).description}
              </div>
            </div>

            {saveInfo && (
              <div className="bg-[#0a0a18] border border-[#00f5ff]/20 rounded-lg p-3 text-left">
                <div className="text-[10px] text-[#00f5ff]/60 font-mono mb-1">{t("saved-progress", { defaultValue: "SAVED PROGRESS" })}</div>
                <div className="flex justify-between items-center">
                  <div>
                    <span className="text-zinc-300 text-sm">{t("wave-number", { defaultValue: "Wave {{wave}}", wave: saveInfo.wave })}</span>
                    {saveInfo.score !== undefined && (
                      <span className="text-[#d4af37] text-[10px] ml-2 font-mono">
                        {saveInfo.score.toLocaleString()} pts
                      </span>
                    )}
                    <span className="text-zinc-600 text-[10px] ml-2 font-mono">
                      {saveInfo.savedAt.toLocaleDateString()}
                    </span>
                  </div>
                  <button
                    onClick={onClearSave}
                    className="text-[10px] text-zinc-600 hover:text-red-400 font-mono transition-colors"
                  >
                    ✕ {t("clear", { defaultValue: "Clear" })}
                  </button>
                </div>
                {onContinueGame && (
                  <Button
                    onClick={onContinueGame}
                    className="w-full mt-2 py-2 bg-[#00f5ff]/10 hover:bg-[#00f5ff]/20 text-[#00f5ff] font-bold border border-[#00f5ff]/40 font-mono tracking-wider text-sm"
                    style={{ boxShadow: '0 0 15px rgba(0,245,255,0.1)' }}
                  >
                    ▶ {t("continue-from-wave", { defaultValue: "CONTINUE FROM WAVE {{wave}}", wave: saveInfo.wave })}
                  </Button>
                )}
              </div>
            )}

            {!session.data ? (
              <Button onClick={() => navigate({ to: '/login', search: { callbackURL: undefined } })}
                className="w-full bg-[#0a0a18] hover:bg-[#14141f] text-[#00f5ff] font-bold py-3 border border-[#00f5ff]/30">
                {t("sign-in-to-play", { defaultValue: "Sign In to Play" })}
              </Button>
            ) : (
              <Button onClick={onStartGame}
                className="w-full py-3 text-lg font-bold bg-[#0a0a18] hover:bg-[#14141f] text-[#00f5ff] border border-[#00f5ff]/40"
                style={{ boxShadow: '0 0 20px rgba(0,245,255,0.15)' }}>
                <Play className="w-5 h-5 mr-2" /> {saveInfo ? t("new-game", { defaultValue: "New Game" }) : t("play", { defaultValue: "Play" })}
              </Button>
            )}
            <Button onClick={() => setShowForge(true)} variant="outline"
              className="w-full py-2 border-[#c9a227]/30 text-[#d4af37] hover:bg-[#d4af37]/10 hover:border-[#c9a227]/60 flex items-center justify-center gap-2">
              <Hexagon className="w-4 h-4" /> {t("void-forge", { defaultValue: "Void Forge" })}
              <span className="font-mono text-xs opacity-80">◈ {meta.cores.toLocaleString()}</span>
            </Button>

            <div className="flex gap-2">
              <Button onClick={() => setShowHelp(true)} variant="outline"
                className="flex-1 py-2 border-[#2a2a3a] text-zinc-500 hover:text-[#d4af37] hover:border-[#c9a227]/40">
                <Gamepad2 className="w-4 h-4 mr-2" /> {t("how-to-play", { defaultValue: "How to Play" })}
              </Button>
              <Button onClick={() => setShowLore(true)} variant="outline"
                className="flex-1 py-2 border-[#2a2a3a] text-zinc-500 hover:text-[#d4af37] hover:border-[#c9a227]/40">
                <BookOpen className="w-4 h-4 mr-2" /> {t("story", { defaultValue: "Story" })}
              </Button>
            </div>
            {lb.length > 0 && (
              <div className="bg-[#1a1a24] border border-[#c9a227]/20 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Trophy className="w-3.5 h-3.5 text-[#d4af37]" />
                  <span className="text-[10px] text-[#c9a227]/80 font-bold uppercase tracking-[0.15em]">{t("leaderboard", { defaultValue: "Leaderboard" })}</span>
                </div>
                <div className="space-y-1">
                  {lb.slice(0, 5).map((e, i) => (
                    <div key={`${e.username}-${i}`} className="flex justify-between text-xs">
                      <span className="text-zinc-500">#{i + 1} {e.username}</span>
                      <span className="text-[#d4af37] font-bold tabular-nums">{e.highScore.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="text-[9px] text-zinc-600 font-mono space-y-0.5">
              <p className="hidden sm:block">{t("controls-desktop", { defaultValue: "WASD move \u00b7 Mouse aim \u00b7 Shift dash \u00b7 F focus \u00b7 Space detonate \u00b7 Esc pause" })}</p>
              <p className="sm:hidden">{t("controls-touch", { defaultValue: "Touch controls during gameplay" })}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Game Over ── (obsidian & gold)
  if (uiState === 'gameOver' && runStats) {
    const secs = Math.floor(runStats.timeSurvivedMs / 1000);
    const timeStr = `${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, '0')}`;
    return (
      <div className="absolute inset-0 flex items-center justify-center z-40 pointer-events-auto overflow-y-auto bg-[#0d0d14]">
        <div className="max-w-md w-full px-4 space-y-3 py-6">
          <div className="text-center space-y-1">
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-[#d4af37]">
              {t("game-over", { defaultValue: "GAME OVER" })}
            </h2>
          </div>

          <div className="bg-[#1a1a24] border border-[#c9a227]/30 rounded-lg p-5 space-y-3">
            <div className="text-center">
              <div className="text-[10px] text-zinc-500 uppercase tracking-[0.2em]">{t("score", { defaultValue: "Score" })}</div>
              <div className="text-3xl font-black text-[#d4af37] tabular-nums">{runStats.score.toLocaleString()}</div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-center">
              {[
                [t("stat-wave", { defaultValue: "Wave" }), runStats.wave, 'text-zinc-300'],
                [t("stat-time", { defaultValue: "Time" }), timeStr, 'text-zinc-300'],
                [t("stat-kills", { defaultValue: "Kills" }), runStats.enemiesKilled, 'text-zinc-300'],
                [t("stat-peak-multi", { defaultValue: "Peak Multi" }), `${runStats.maxMultiplier}x`, 'text-[#d4af37]'],
                ...(runStats.bossesKilled > 0 ? [[t("stat-bosses", { defaultValue: "Bosses" }), runStats.bossesKilled, 'text-red-400']] : []),
                ...(runStats.maxCombo > 1 ? [[t("stat-best-combo", { defaultValue: "Best Combo" }), `${runStats.maxCombo}x`, 'text-[#c9a227]']] : []),
              ].map(([label, val, cls], i) => (
                <div key={i}>
                  <div className="text-[10px] text-zinc-600">{label}</div>
                  <div className={`text-lg font-bold ${cls}`}>{val}</div>
                </div>
              ))}
            </div>
          </div>

          {earnedCores > 0 && (
            <button onClick={() => setShowForge(true)}
              className="w-full bg-[#d4af37]/10 border border-[#c9a227]/40 rounded-lg p-2.5 text-center hover:bg-[#d4af37]/20 transition-colors">
              <span className="text-[#d4af37] font-mono font-bold text-sm">
                {t("cores-earned", { defaultValue: "+{{n}} ◈ Void Cores", n: earnedCores.toLocaleString() })}
              </span>
              <span className="block text-[9px] text-zinc-500 font-mono mt-0.5">
                {t("spend-in-forge", { defaultValue: "Spend in the Void Forge →" })}
              </span>
            </button>
          )}

          {runStats.upgrades.length > 0 && (
            <div className="bg-[#1a1a24] border border-[#c9a227]/20 rounded-lg p-3">
              <div className="text-[10px] text-[#c9a227]/80 font-bold uppercase tracking-[0.15em] mb-2">
                {t("your-build", { defaultValue: "Your Build" })}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {runStats.upgrades.map((u) => (
                  <span key={u.name}
                    className="inline-flex items-center gap-1 text-[11px] font-mono px-1.5 py-0.5 rounded border"
                    style={{ color: u.color, borderColor: u.color + '40', background: u.color + '10' }}>
                    <span>{u.icon}</span>{u.name}{u.count > 1 && <span className="opacity-70">×{u.count}</span>}
                  </span>
                ))}
              </div>
            </div>
          )}

          {!session.data ? (
            <Button onClick={() => navigate({ to: '/login', search: { callbackURL: undefined } })}
              className="w-full bg-[#1a1a24] hover:bg-[#252530] text-[#d4af37] font-bold border border-[#c9a227]/40">
              {t("sign-in-to-submit", { defaultValue: "Sign In to Submit" })}
            </Button>
          ) : (
            <p className="text-[10px] text-[#c9a227]/80 text-center font-mono">
              {submitted ? t("score-submitted", { defaultValue: "\u2713 Score submitted" }) : t("score-submitting", { defaultValue: "Submitting\u2026" })}
            </p>
          )}

          <div className="flex gap-2 flex-wrap">
            <Button onClick={onStartGame}
              className="flex-1 min-w-[100px] font-bold bg-[#1a1a24] hover:bg-[#252530] text-[#d4af37] border border-[#c9a227]/40">
              <RotateCcw className="w-4 h-4 mr-1" /> {t("again", { defaultValue: "Again" })}
            </Button>
            <Button onClick={() => setShowSettings(true)} variant="outline"
              className="border-[#2a2a3a] text-zinc-500 hover:bg-[#1a1a24] hover:text-[#d4af37]">
              <Settings className="w-4 h-4" />
            </Button>
            <Button onClick={onGoToMenu} variant="outline"
              className="flex-1 min-w-[100px] border-[#2a2a3a] text-zinc-500 hover:bg-[#1a1a24] hover:text-[#d4af37]">
              {t("menu", { defaultValue: "Menu" })}
            </Button>
          </div>

          {lb.length > 0 && (
            <div className="bg-[#1a1a24] border border-[#c9a227]/20 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Trophy className="w-3 h-3 text-[#d4af37]" />
                <span className="text-[10px] text-[#c9a227]/80 font-bold uppercase tracking-[0.15em]">{t("leaderboard", { defaultValue: "Leaderboard" })}</span>
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {lb.slice(0, 10).map((e, i) => (
                  <div key={`${e.username}-${i}`} className="flex justify-between text-xs">
                    <span className="text-zinc-500">#{i + 1} {e.username}</span>
                    <span className="text-[#d4af37] font-bold tabular-nums">{e.highScore.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
