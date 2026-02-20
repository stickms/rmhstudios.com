'use client';

import * as React from 'react';
import { useGameStore } from '@/lib/store/useGameStore';

export function MultiplayerSidebar() {
    const { opponents } = useGameStore();
    const opponentList = Object.values(opponents);

    return (
        <div className="w-72 bg-slice-bg border-l border-slice-shadow-dark/50/50 p-4 flex flex-col gap-4 shadow-[-5px_0_15px_rgba(0,0,0,0.05)] z-10 shrink-0">
            <h3 className="font-black text-slice-text-light text-xs tracking-widest uppercase mb-2">OPPONENTS</h3>
            
            {opponentList.length === 0 ? (
                <div className="text-center text-slice-text-light text-sm mt-10 italic opacity-50">
                    No active opponents
                </div>
            ) : (
                <div className="flex flex-col gap-3 overflow-y-auto flex-1 custom-scrollbar pr-1">
                    {opponentList.map(op => (
                        <div key={op.id} className="bg-slice-bg p-3 rounded-xl shadow-[5px_5px_10px_var(--slice-shadow-dark),-5px_-5px_10px_var(--slice-shadow-light)] border border-white/50 relative overflow-hidden group">
                            {/* Rank Badge (Placeholder logic) */}
                            <div className="flex justify-between items-center mb-1 relative z-10">
                                <div className="font-bold text-slice-text text-sm truncate max-w-[120px]" title={op.name}>
                                    {op.name}
                                </div>
                                <div className="text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400">
                                    ACTIVE
                                </div>
                            </div>
                            
                            <div className="space-y-1 relative z-10">
                                <div className="flex justify-between items-end">
                                    <span className="text-[10px] font-bold text-slice-text-light">SCORE</span>
                                    <span className="font-black text-blue-600 text-lg leading-none">{op.score.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between items-end">
                                    <span className="text-[10px] font-bold text-slice-text-light">COMBO</span>
                                    <span className="font-bold text-slice-text-muted text-sm leading-none">{op.combo}x</span>
                                </div>
                            </div>

                            {/* Progress Bar Background? Maybe later. For now just standard neumorphic card */}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
