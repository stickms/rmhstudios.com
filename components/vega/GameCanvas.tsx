'use client';

import { useEffect, useRef, useState } from 'react';
import { VegaGame } from '@/lib/vega/VegaGame';
import { useGameStore, TOWER_COSTS } from '@/lib/vega/GameState';
import { TowerType } from '@/lib/vega/Entities';

export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<VegaGame | null>(null);
  
  const { 
    focus, 
    currentLoop, 
    selectedTower, 
    setSelectedTower,
    selectedEntity,
    isTransitioning,
    showTutorial,
    setShowTutorial,
    logs
  } = useGameStore();

  const [volume, setVolume] = useState(0.2);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTrack, setCurrentTrack] = useState(1);

  useEffect(() => {
    if (!canvasRef.current) return;

    // Initialize Game
    gameRef.current = new VegaGame(canvasRef.current);
    gameRef.current.start();

    // Cleanup
    return () => {
      gameRef.current?.destroy();
    };
  }, []);

  // Audio Logic
  useEffect(() => {
    // Load volume
    const saved = localStorage.getItem('vega_volume');
    if (saved) setVolume(parseFloat(saved));
  }, []);

  useEffect(() => {
    if (audioRef.current) {
        audioRef.current.volume = volume;
    }
    localStorage.setItem('vega_volume', volume.toString());
  }, [volume]);

  // Handle track ending
  const handleTrackEnd = () => {
    const nextTrack = currentTrack < 4 ? currentTrack + 1 : 1;
    setCurrentTrack(nextTrack);
  };
  
  // Auto-play attempt on interaction?
  // Simply rendering the audio tag with autoPlay might be blocked.
  // We can start it when tutorial is closed.

  // Interactions
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            const state = useGameStore.getState();
            if (state.selectedEntity || state.selectedTower) {
                state.setSelectedEntity(null);
                state.setSelectedTower(null);
            } else {
                state.setPaused(!state.isPaused);
            }
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const towers: {type: TowerType, label: string, key: string, desc: string}[] = [
    { type: 'SYNAPSE', label: 'SYNAPSE', key: '1', desc: 'Basic Dmg' },
    { type: 'SUPPRESSOR', label: 'SUPPRESSOR', key: '2', desc: 'Slows' },
    { type: 'LOBOTOMIZER', label: 'LOBOTOMIZER', key: '3', desc: 'Sniper' },
    { type: 'ECHO', label: 'ECHO', key: '4', desc: 'Buff/Support' },
  ];

  const { isPaused, level, unlockedTowers } = useGameStore();

  return (
    <div className="w-full min-h-screen flex flex-col md:flex-row items-center justify-center bg-slate-950 p-2 md:p-4 gap-4">
      {/* Audio Element */}
      <audio 
        ref={audioRef}
        src={`/music/vega/${currentTrack}.mp3`}
        onEnded={handleTrackEnd}
        autoPlay
        loop={false}
      />

      {/* MOBILE HEADER (Level / Focus) */}
      <div className="md:hidden w-full flex justify-between items-center bg-slate-900 border border-slate-700 p-2 rounded text-blue-200 font-mono text-xs">
          <div className="flex gap-4">
              <span className="font-bold text-white">LVL {level}</span>
              <span className="text-yellow-300">{focus} F</span>
          </div>
          <button onClick={() => setShowTutorial(true)} className="underline">[HELP]</button>
      </div>

      <div ref={containerRef} className="relative w-full max-w-[1200px] aspect-[3/2] max-h-[85vh] bg-slate-900 border-2 border-slate-700 rounded-xl overflow-hidden shadow-2xl shadow-blue-900/20 flex items-center justify-center font-mono text-slate-100">
      
      {/* CRT Overlay Effect */}
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(255,255,255,0)_50%,rgba(255,255,255,0.05)_50%),linear-gradient(90deg,rgba(0,0,0,0.02),rgba(255,255,255,0.01),rgba(0,0,0,0.02))] z-10 bg-[length:100%_2px,3px_100%] pointer-events-none opacity-50" />
      
      {/* Canvas */}
      <canvas 
        ref={canvasRef}
        className="block w-full h-full"
        style={{ imageRendering: 'pixelated' }}
      />
      
      {/* --- DESKTOP OVERLAY UI LAYER --- */}
      {/* Visible only on md+ screens */}

      {/* HUD - Top Left */}
      <div className="hidden md:block absolute top-4 left-4 font-mono text-blue-200 z-20 pointer-events-none">
        <h1 className="text-xl font-bold tracking-widest drop-shadow-md text-white">VEGA_SYSTEM</h1>
        <div className="flex items-center gap-4">
            <p className="text-xs opacity-70">LEVEL: {level}</p>
            <button onClick={() => setShowTutorial(true)} className="pointer-events-auto text-[10px] underline hover:text-white cursor-pointer">[HELP]</button>
        </div>
        <p className="text-sm mt-1 text-yellow-100 font-bold">FOCUS: {focus}</p>
      </div>

      {/* Upgrade Menu - Smart Positioning (Desktop) */}
      {selectedEntity && (
        <div 
            className={`hidden md:block absolute top-1/2 -translate-y-1/2 bg-slate-900/90 backdrop-blur-md p-4 rounded-xl border border-blue-500/30 w-64 z-30 shadow-2xl transition-all
                ${selectedEntity.x > 15 ? 'left-4' : 'right-4'} 
            `}
        >
             <UpgradeUtils 
                selectedEntity={selectedEntity} 
                focus={focus} 
                onSell={() => gameRef.current?.sellTower(selectedEntity)}
             />
        </div>
      )}
      
      {/* HUD - Top Right (Audio Control) - Desktop */}
      <div className="hidden md:flex absolute top-4 right-4 z-20 flex-col items-end gap-2 p-2 bg-slate-900/50 backdrop-blur-sm rounded-lg border border-slate-700/50">
        <AudioControls 
            currentTrack={currentTrack} 
            setCurrentTrack={setCurrentTrack} 
            volume={volume} 
            setVolume={setVolume} 
        />
      </div>
      
      {/* HUD - Bottom Bar (Shop) - Desktop */}
      <div className="hidden md:flex absolute bottom-4 left-1/2 -translate-x-1/2 z-20 gap-2">
        <ShopButtons 
            towers={towers} 
            unlockedTowers={unlockedTowers} 
            selectedTower={selectedTower} 
            setSelectedTower={setSelectedTower} 
        />
      </div>
      
      {/* HUD - Bottom Right Actions - Desktop */}
      <div className="hidden md:block absolute bottom-4 right-4 z-20">
         <RecallButton level={level} focus={focus} gameRef={gameRef} />
      </div>

      {/* SHARED OVERLAYS (Pause, Transition, Tutorial) */}
      {/* Pause Menu */}
      {isPaused && (
          <div className="absolute inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-slate-800 border border-slate-600 p-6 md:p-8 rounded-xl shadow-2xl text-center space-y-4 w-full max-w-sm">
                  <h2 className="text-2xl font-bold text-white tracking-widest mb-4">SYSTEM PAUSED</h2>
                  <button 
                    onClick={() => useGameStore.getState().setPaused(false)}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded font-bold uppercase tracking-wide transition-all"
                  >
                      Resume
                  </button>
                  <button 
                    onClick={() => window.location.href = '/'}
                    className="w-full py-3 bg-slate-700 hover:bg-red-500/20 hover:text-red-200 text-slate-300 rounded font-bold uppercase tracking-wide transition-all"
                  >
                      Main Menu
                  </button>
              </div>
          </div>
      )}

      {/* Transition Overlay */}
      {isTransitioning && (
           <div className="absolute inset-0 z-50 bg-slate-900/90 backdrop-blur-md flex flex-col items-center justify-center text-blue-200 animate-pulse">
               <h2 className="text-2xl md:text-4xl font-bold tracking-[0.5em] mb-4 text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.8)] text-center">RECALLING...</h2>
               <div className="w-48 md:w-64 h-2 bg-slate-700/50 rounded overflow-hidden">
                   <div className="h-full bg-blue-400 w-full animate-[progress_2s_ease-in-out]" />
               </div>
               <p className="mt-4 text-xs md:text-sm opacity-70">SYNCING TEMPORAL DATA</p>
           </div>
      )}

      {/* Tutorial Modal */}
      {showTutorial && (
          <div className="absolute inset-0 z-40 bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4 md:p-8">
              <div className="max-w-xl w-full bg-slate-800 border-2 border-slate-600 p-6 md:p-8 shadow-2xl relative rounded-xl max-h-[90vh] overflow-y-auto">
                  <button 
                    onClick={() => setShowTutorial(false)}
                    className="absolute top-4 right-4 text-slate-400 hover:text-white"
                  >
                     [X]
                  </button>
                  <h2 className="text-2xl font-bold text-white mb-6 border-b border-slate-600 pb-2">SYSTEM MANUAL</h2>
                  <div className="space-y-6 text-slate-300 text-sm leading-relaxed">
                      <div><h3 className="text-blue-300 font-bold mb-1">OBJECTIVE</h3><p>Defend the core.</p></div>
                      <div>
                         <h3 className="text-blue-300 font-bold mb-1">RECALL & PROGRESSION</h3>
                         <p>Accumulate Focus to trigger <span className="text-red-300 font-bold">[RECALL]</span>. Advances Level, resets board, unlocks towers.</p>
                         <p className="mt-2 text-blue-200"><strong>MVP GHOST:</strong> Strongest tower persists.</p>
                      </div>
                      <div>
                          <h3 className="text-blue-300 font-bold mb-1">CONTROLS</h3>
                          <ul className="list-disc list-inside space-y-1 opacity-80">
                              <li><strong>Tap/Click</strong>: Place/Select</li>
                              <li><strong>Esc</strong>: Pause</li>
                          </ul>
                      </div>
                  </div>
                  <button 
                    onClick={() => {
                        setShowTutorial(false);
                        if (audioRef.current?.paused) audioRef.current?.play().catch(e => console.log('Audio play failed', e));
                    }}
                    className="w-full mt-8 bg-blue-600 hover:bg-blue-500 text-white py-3 font-bold transition-all rounded-lg uppercase tracking-widest shadow-lg"
                  >
                      Close Manual
                  </button>
              </div>
          </div>
      )}
      
      </div>

      {/* MOBILE CONTROLS (Below Canvas) */}
      <div className="md:hidden w-full flex flex-col gap-4">
          
          {/* Mobile Upgrade Menu (If selected) */}
          {selectedEntity && (
              <div className="bg-slate-900 border border-slate-700 p-4 rounded-xl">
                  <UpgradeUtils 
                    selectedEntity={selectedEntity} 
                    focus={focus} 
                    onSell={() => gameRef.current?.sellTower(selectedEntity)}
                  />
                  <button onClick={() => useGameStore.getState().setSelectedEntity(null)} className="mt-2 w-full py-2 bg-slate-800 text-slate-400 text-xs rounded">CLOSE SELECTION</button>
              </div>
          )}

          {/* Mobile Shop */}
          <div className="flex overflow-x-auto gap-2 pb-2">
             <ShopButtons 
                towers={towers} 
                unlockedTowers={unlockedTowers} 
                selectedTower={selectedTower} 
                setSelectedTower={setSelectedTower} 
             />
          </div>

          {/* Mobile Actions */}
          <div className="flex justify-between items-center gap-2">
              <AudioControls 
                currentTrack={currentTrack} 
                setCurrentTrack={setCurrentTrack} 
                volume={volume} 
                setVolume={setVolume} 
              />
              <RecallButton level={level} focus={focus} gameRef={gameRef} />
          </div>
      </div>

    </div>
  );
}

// --- Subcomponents for Reuse (avoid duplication) ---
const UpgradeUtils = ({ selectedEntity, focus, onSell }: any) => (
    <>
        <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-2">
            <h3 className="font-bold text-blue-300 uppercase">{selectedEntity.type} TOWER</h3>
        </div>
        <div className="space-y-4">
            {['damage', 'range', 'rate'].map(stat => {
                const cost = selectedEntity.getUpgradeCost(stat);
                const level = selectedEntity.upgrades[stat];
                return (
                    <div key={stat} className="bg-slate-800/50 p-2 rounded border border-white/5">
                        <div className="flex justify-between text-xs mb-1 text-slate-400 uppercase font-bold">
                            <span>{stat} (Lvl {level})</span>
                            <span className={focus >= cost ? 'text-yellow-300' : 'text-red-400'}>{cost} F</span>
                        </div>
                        <button 
                            onClick={() => {
                                if (focus >= cost) {
                                    useGameStore.getState().modifyFocus(-cost);
                                    selectedEntity.upgrade(stat);
                                    useGameStore.getState().addLog(`UPGRADED ${stat}`, 'success');
                                } else {
                                    useGameStore.getState().addLog('INSUFFICIENT FOCUS', 'warning');
                                }
                            }}
                            className={`w-full py-1 text-xs font-bold rounded transition-colors uppercase
                                ${focus >= cost 
                                    ? 'bg-blue-600 hover:bg-blue-500 text-white shadow' 
                                    : 'bg-slate-700 text-slate-500 cursor-not-allowed'}
                            `}
                        >
                            Upgrade {stat}
                        </button>
                    </div>
                )
            })}
        </div>
        
        <div className="mt-4 pt-4 border-t border-white/10">
            <button 
                onClick={onSell}
                className="w-full py-2 bg-red-900/30 hover:bg-red-900/50 border border-red-500/30 text-red-300 text-xs font-bold rounded uppercase transition-all flex justify-between px-4"
            >
                <span>SELL SYSTEM</span>
                <span>+{typeof selectedEntity.getSellValue === 'function' ? selectedEntity.getSellValue() : Math.floor((selectedEntity.totalInvested || 0) * 0.7)} F</span>
            </button>
        </div>
         <p className="text-[10px] text-center mt-2 text-slate-500">GHOSTS CANNOT BE UPGRADED</p> 
    </>
);


// Better approach: Define components with props
const AudioControls = ({ currentTrack, setCurrentTrack, volume, setVolume }: any) => (
    <>
        <div className="flex items-center gap-2">
            <button onClick={() => setCurrentTrack((prev: number) => prev > 1 ? prev - 1 : 4)} className="text-xs text-blue-200 bg-slate-800 px-2 py-1 rounded border border-slate-600">Prev</button>
            <span className="text-[10px] text-blue-100 font-bold w-12 text-center">TRK {currentTrack}</span>
            <button onClick={() => setCurrentTrack((prev: number) => prev < 4 ? prev + 1 : 1)} className="text-xs text-blue-200 bg-slate-800 px-2 py-1 rounded border border-slate-600">Next</button>
        </div>
        <input type="range" min="0" max="1" step="0.05" value={volume} onChange={(e) => setVolume(parseFloat(e.target.value))} className="w-32 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer" />
    </>
);

const ShopButtons = ({ towers, unlockedTowers, selectedTower, setSelectedTower }: any) => (
    <>
    {towers.map((t: any) => {
             const isUnlocked = unlockedTowers.includes(t.type);
             return (
                 <button
                    key={t.type}
                    onClick={() => isUnlocked && setSelectedTower(selectedTower === t.type ? null : t.type)}
                    disabled={!isUnlocked}
                    className={`
                        flex flex-col items-center justify-center px-4 py-2 border rounded-lg transition-all min-w-[80px] md:min-w-[100px] backdrop-blur-sm
                        ${!isUnlocked ? 'opacity-50 grayscale cursor-not-allowed bg-slate-900 border-slate-800' :
                          selectedTower === t.type 
                            ? 'bg-blue-500/30 border-blue-300 text-white shadow-[0_0_15px_rgba(56,189,248,0.4)] scale-105' 
                            : 'bg-slate-900/60 border-slate-600 text-slate-400 hover:bg-slate-800 hover:text-blue-200'}
                    `}
                 >
                    {isUnlocked ? (
                        <>
                            <span className="text-[10px] md:text-xs font-bold">{t.label}</span>
                            <span className="text-[9px] md:text-[10px] opacity-70">{TOWER_COSTS[t.type as TowerType]}F</span>
                        </>
                    ) : (
                        <span className="text-[10px] md:text-xs font-bold text-slate-600">[LOCKED]</span>
                    )}
                 </button>
             )
        })}
    </>
);

const RecallButton = ({ level, focus, gameRef }: any) => {
    const cost = 1000 * level;
    const canRecall = focus >= cost;
    return (
         <button 
           onClick={() => canRecall && gameRef.current?.advanceLevel()}
           className={`
                px-4 py-2 text-xs font-mono transition-colors cursor-pointer rounded backdrop-blur-sm border whitespace-nowrap
                ${canRecall 
                    ? 'bg-red-500/20 border-red-400 text-red-200 hover:bg-red-500/40 hover:text-white animate-pulse' 
                    : 'bg-slate-800/50 border-slate-700 text-slate-500 cursor-not-allowed'}
           `}
         >
           {canRecall ? `[INITIALIZE RECALL]` : `[RECALL: ${cost}F]`}
         </button>
    )
}
