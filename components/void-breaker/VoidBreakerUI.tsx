'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Play, RotateCcw, Trophy, Volume2, VolumeX, BookOpen, ArrowLeft, Settings } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import type { RunStats } from '@/lib/void-breaker/types';

type LBEntry = { username: string; highScore: number };

export function VoidBreakerUI({
  uiState, runStats, onStartGame, onGoToMenu, muted, onToggleMute,
  musicVolume, onMusicVolumeChange, saveInfo, onClearSave, onContinueGame,
}: {
  uiState: 'menu' | 'playing' | 'gameOver';
  runStats: RunStats | null;
  onStartGame: () => void;
  onGoToMenu: () => void;
  muted: boolean;
  onToggleMute: () => void;
  musicVolume: number;
  onMusicVolumeChange: (v: number) => void;
  saveInfo: { wave: number; savedAt: Date; score?: number } | null;
  onClearSave: () => void;
  onContinueGame?: () => void;
}) {
  const [lb, setLb] = useState<LBEntry[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [showLore, setShowLore] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const session = authClient.useSession();
  const router = useRouter();

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
            <ArrowLeft className="w-4 h-4" /> Back
          </button>

          <h2 className="text-xl font-bold text-[#d4af37] flex items-center gap-2">
            <Settings className="w-5 h-5" /> Settings
          </h2>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm text-zinc-400">Music Volume</label>
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
          </div>

          <Button onClick={() => setShowSettings(false)}
            className="w-full bg-[#1a1a24] hover:bg-[#252530] text-[#d4af37] border border-[#c9a227]/40">
            Done
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
            <ArrowLeft className="w-4 h-4" /> Back
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
                reality in a sphere around you. It kills everything nearby. It also resets your power to zero.
                The question is always the same: hold for the multiplier, or burn it all to survive.
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
              Return
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
                Obsidian Arena Shooter
              </div>
            </div>

            <p className="text-zinc-500 text-xs leading-relaxed max-w-xs mx-auto">
              Collect shards. Dash. Focus to slow time. Detonate when overwhelmed. Survive the waves.
            </p>

            {saveInfo && (
              <div className="bg-[#0a0a18] border border-[#00f5ff]/20 rounded-lg p-3 text-left">
                <div className="text-[10px] text-[#00f5ff]/60 font-mono mb-1">SAVED PROGRESS</div>
                <div className="flex justify-between items-center">
                  <div>
                    <span className="text-zinc-300 text-sm">Wave {saveInfo.wave}</span>
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
                    ✕ Clear
                  </button>
                </div>
                {onContinueGame && (
                  <Button
                    onClick={onContinueGame}
                    className="w-full mt-2 py-2 bg-[#00f5ff]/10 hover:bg-[#00f5ff]/20 text-[#00f5ff] font-bold border border-[#00f5ff]/40 font-mono tracking-wider text-sm"
                    style={{ boxShadow: '0 0 15px rgba(0,245,255,0.1)' }}
                  >
                    ▶ CONTINUE FROM WAVE {saveInfo.wave}
                  </Button>
                )}
              </div>
            )}

            {!session.data ? (
              <Button onClick={() => router.push('/login')}
                className="w-full bg-[#0a0a18] hover:bg-[#14141f] text-[#00f5ff] font-bold py-3 border border-[#00f5ff]/30">
                Sign In to Play
              </Button>
            ) : (
              <Button onClick={onStartGame}
                className="w-full py-3 text-lg font-bold bg-[#0a0a18] hover:bg-[#14141f] text-[#00f5ff] border border-[#00f5ff]/40"
                style={{ boxShadow: '0 0 20px rgba(0,245,255,0.15)' }}>
                <Play className="w-5 h-5 mr-2" /> {saveInfo ? 'New Game' : 'Play'}
              </Button>
            )}
            <div className="flex gap-2">
              <Button onClick={() => setShowSettings(true)} variant="outline"
                className="flex-1 py-2 border-[#2a2a3a] text-zinc-500 hover:text-[#d4af37] hover:border-[#c9a227]/40">
                <Settings className="w-4 h-4 mr-2" /> Settings
              </Button>
              <Button onClick={() => setShowLore(true)} variant="outline"
                className="flex-1 py-2 border-[#2a2a3a] text-zinc-500 hover:text-[#d4af37] hover:border-[#c9a227]/40">
                <BookOpen className="w-4 h-4 mr-2" /> Story
              </Button>
            </div>
            {lb.length > 0 && (
              <div className="bg-[#1a1a24] border border-[#c9a227]/20 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Trophy className="w-3.5 h-3.5 text-[#d4af37]" />
                  <span className="text-[10px] text-[#c9a227]/80 font-bold uppercase tracking-[0.15em]">Leaderboard</span>
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
              <p className="hidden sm:block">WASD move {'\u00b7'} Mouse aim {'\u00b7'} Shift dash {'\u00b7'} F focus {'\u00b7'} Space detonate {'\u00b7'} Esc pause</p>
              <p className="sm:hidden">Touch controls during gameplay</p>
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
              GAME OVER
            </h2>
          </div>

          <div className="bg-[#1a1a24] border border-[#c9a227]/30 rounded-lg p-5 space-y-3">
            <div className="text-center">
              <div className="text-[10px] text-zinc-500 uppercase tracking-[0.2em]">Score</div>
              <div className="text-3xl font-black text-[#d4af37] tabular-nums">{runStats.score.toLocaleString()}</div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-center">
              {[
                ['Wave', runStats.wave, 'text-zinc-300'],
                ['Time', timeStr, 'text-zinc-300'],
                ['Kills', runStats.enemiesKilled, 'text-zinc-300'],
                ['Peak Multi', `${runStats.maxMultiplier}x`, 'text-[#d4af37]'],
                ...(runStats.bossesKilled > 0 ? [['Bosses', runStats.bossesKilled, 'text-red-400']] : []),
                ...(runStats.maxCombo > 1 ? [['Best Combo', `${runStats.maxCombo}x`, 'text-[#c9a227]']] : []),
              ].map(([label, val, cls], i) => (
                <div key={i}>
                  <div className="text-[10px] text-zinc-600">{label}</div>
                  <div className={`text-lg font-bold ${cls}`}>{val}</div>
                </div>
              ))}
            </div>
          </div>

          {!session.data ? (
            <Button onClick={() => router.push('/login')}
              className="w-full bg-[#1a1a24] hover:bg-[#252530] text-[#d4af37] font-bold border border-[#c9a227]/40">
              Sign In to Submit
            </Button>
          ) : (
            <p className="text-[10px] text-[#c9a227]/80 text-center font-mono">
              {submitted ? '\u2713 Score submitted' : 'Submitting\u2026'}
            </p>
          )}

          <div className="flex gap-2 flex-wrap">
            <Button onClick={onStartGame}
              className="flex-1 min-w-[100px] font-bold bg-[#1a1a24] hover:bg-[#252530] text-[#d4af37] border border-[#c9a227]/40">
              <RotateCcw className="w-4 h-4 mr-1" /> Again
            </Button>
            <Button onClick={() => setShowSettings(true)} variant="outline"
              className="border-[#2a2a3a] text-zinc-500 hover:bg-[#1a1a24] hover:text-[#d4af37]">
              <Settings className="w-4 h-4" />
            </Button>
            <Button onClick={onGoToMenu} variant="outline"
              className="flex-1 min-w-[100px] border-[#2a2a3a] text-zinc-500 hover:bg-[#1a1a24] hover:text-[#d4af37]">
              Menu
            </Button>
          </div>

          {lb.length > 0 && (
            <div className="bg-[#1a1a24] border border-[#c9a227]/20 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Trophy className="w-3 h-3 text-[#d4af37]" />
                <span className="text-[10px] text-[#c9a227]/80 font-bold uppercase tracking-[0.15em]">Leaderboard</span>
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
