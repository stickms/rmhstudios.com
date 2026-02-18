'use client';

import { AbilityState } from '@/lib/echoes/game2d/ClassStore';
import { GameClass } from '@/lib/echoes/game2d/ClassStore';

interface AbilityHUDProps {
    gameClass: GameClass;
    abilityStates: AbilityState[];
}

export default function AbilityHUD({ gameClass, abilityStates }: AbilityHUDProps) {
    return (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-3 z-40">
            {gameClass.abilities.map((ability, i) => {
                const state = abilityStates[i];
                const cd = gameClass.abilities[i].cooldown;
                const progress = state.cooldownRemaining > 0 ? state.cooldownRemaining / cd : 0;
                const ready = state.cooldownRemaining <= 0;
                const active = state.active;

                return (
                    <div key={ability.id} className="flex flex-col items-center gap-1">
                        {/* Cooldown ring + icon */}
                        <div className="relative w-14 h-14">
                            {/* Background circle */}
                            <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 56 56">
                                <circle cx="28" cy="28" r="24" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
                                {progress > 0 && (
                                    <circle
                                        cx="28" cy="28" r="24"
                                        fill="none"
                                        stroke={gameClass.color}
                                        strokeWidth="3"
                                        strokeDasharray={`${2 * Math.PI * 24}`}
                                        strokeDashoffset={`${2 * Math.PI * 24 * (1 - progress)}`}
                                        strokeLinecap="round"
                                        style={{ transition: 'stroke-dashoffset 0.1s linear' }}
                                    />
                                )}
                            </svg>
                            {/* Icon button */}
                            <div
                                className={`absolute inset-1.5 rounded-full flex items-center justify-center text-2xl transition-all ${
                                    active ? 'bg-white/30 scale-110' :
                                    ready ? 'bg-white/10 hover:bg-white/15' :
                                    'bg-black/60'
                                }`}
                                style={active ? { boxShadow: `0 0 16px ${gameClass.color}` } : {}}
                            >
                                {!ready && (
                                    <div className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center">
                                        <span className="text-white font-mono font-bold text-xs">
                                            {Math.ceil(state.cooldownRemaining)}
                                        </span>
                                    </div>
                                )}
                                <span className={ready ? 'opacity-100' : 'opacity-30'}>{ability.icon}</span>
                            </div>
                        </div>
                        {/* Key label */}
                        <div className="flex flex-col items-center">
                            <span className="text-white/50 text-xs font-mono">[{ability.key}]</span>
                            <span className="text-white/70 text-xs font-bold">{ability.name}</span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
