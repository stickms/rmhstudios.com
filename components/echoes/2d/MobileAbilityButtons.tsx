'use client';

import { AbilityState, GameClass } from '@/lib/echoes/game2d/ClassStore';

interface MobileAbilityButtonsProps {
    gameClass: GameClass;
    abilityStates: AbilityState[];
    onActivate: (index: number) => void;
}

export default function MobileAbilityButtons({ gameClass, abilityStates, onActivate }: MobileAbilityButtonsProps) {
    return (
        <div className="absolute bottom-28 right-4 flex flex-col gap-3 z-40">
            {gameClass.abilities.map((ability, i) => {
                const state = abilityStates[i];
                const ready = state.cooldownRemaining <= 0;
                const cd = gameClass.abilities[i].cooldown;
                const progress = state.cooldownRemaining > 0 ? state.cooldownRemaining / cd : 0;

                return (
                    <div key={ability.id} className="relative">
                        <button
                            onTouchStart={e => { e.preventDefault(); if (ready) onActivate(i); }}
                            onClick={() => { if (ready) onActivate(i); }}
                            className={`relative w-16 h-16 rounded-full flex items-center justify-center text-2xl border-2 transition-all active:scale-90 ${
                                state.active ? 'border-white bg-white/20' :
                                ready ? 'border-white/40 bg-black/60 active:bg-white/10' :
                                'border-white/10 bg-black/80 opacity-60'
                            }`}
                            style={state.active ? { borderColor: gameClass.color, boxShadow: `0 0 16px ${gameClass.color}` } : {}}
                        >
                            {/* Cooldown arc overlay */}
                            {progress > 0 && (
                                <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 64 64">
                                    <circle cx="32" cy="32" r="28" fill="none" stroke={gameClass.color} strokeWidth="3"
                                        strokeDasharray={`${2 * Math.PI * 28}`}
                                        strokeDashoffset={`${2 * Math.PI * 28 * (1 - progress)}`}
                                        strokeLinecap="round"
                                    />
                                </svg>
                            )}
                            <span className={ready ? 'opacity-100' : 'opacity-30'}>{ability.icon}</span>
                            {!ready && (
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <span className="text-white font-mono font-bold text-xs bg-black/60 rounded-full px-1">
                                        {Math.ceil(state.cooldownRemaining)}
                                    </span>
                                </div>
                            )}
                        </button>
                        <div className="text-center text-white/40 text-xs font-mono mt-0.5">{ability.name}</div>
                    </div>
                );
            })}
        </div>
    );
}
