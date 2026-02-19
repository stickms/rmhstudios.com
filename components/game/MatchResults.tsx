'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useGameStore } from '@/lib/store/useGameStore';
import { MultiplayerFactory } from '@/lib/game/MultiplayerFactory';

interface PlayerResult {
    id: string;
    name: string;
    score: number;
    combo: number;
    health: number;
    isLocal?: boolean;
}

export function MatchResults({ onBack }: { onBack: () => void }) {
    const { opponents } = useGameStore();
    // In a real implementation, we'd probably get the final results payload from the server
    // to ensure accuracy, but for now we can use the last known state from store + local state.
    
    // We need to fetch local player stats too
    // But GameEngine resets on finish?
    // We should probably pass results in as props or store them in a "lastMatchResults" store.
    
    const [results, setResults] = React.useState<PlayerResult[]>([]);
    
    React.useEffect(() => {
        // Construct results list
        const list: PlayerResult[] = [];
        
        // Add Opponents
        Object.entries(opponents).forEach(([id, op]) => {
           list.push({
               id,
               name: op.name,
               score: op.score,
               combo: 0, // Store doesn't track opponent combo yet?
               health: 0
           });
        });
        
        // Add Self (need to get from store before it was reset?)
        // Ideally the parent component passes this data or we grab it before unmount.
        // For this milestone, we'll assume the store still has the *last* game state IF we didn't reset yet.
        // But GameCanvas resets on mount/unmount often.
        
        // Let's listen for a "match_results" event from server instead, which is more reliable.
        const mp = MultiplayerFactory.getInstance();
        
        // If we are just viewing this component, maybe we request results?
        
    }, [opponents]);

    return (
        <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-md p-4">
             <Card className="w-full max-w-2xl bg-[#e0e5ec] shadow-[20px_20px_60px_#bebebe,-20px_-20px_60px_#ffffff] rounded-[2rem] border-none">
                <CardHeader>
                    <CardTitle className="text-3xl font-black text-center text-slate-600">MATCH RESULTS</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        {results.sort((a,b) => b.score - a.score).map((p, i) => (
                            <div key={p.id} className={`flex items-center justify-between p-4 rounded-xl ${i === 0 ? 'bg-yellow-100 border-2 border-yellow-400' : 'bg-[#e0e5ec] shadow-[inset_3px_3px_6px_#a3b1c6,inset_-3px_-3px_6px_#ffffff]'}`}>
                                <div className="flex items-center gap-4">
                                    <div className="text-2xl font-black text-slate-400 w-8">#{i+1}</div>
                                    <div>
                                        <div className="font-bold text-lg text-slate-700">{p.name} {p.isLocal && '(YOU)'}</div>
                                        <div className="text-xs text-slate-500">Combo: {p.combo}</div>
                                    </div>
                                </div>
                                <div className="text-2xl font-black text-slate-700">
                                    {p.score.toLocaleString()}
                                </div>
                            </div>
                        ))}
                        
                        {results.length === 0 && (
                            <div className="text-center text-slate-400 py-8">
                                Waiting for results...
                            </div>
                        )}
                    </div>
                    
                    <Button 
                        className="w-full py-6 bg-blue-500 hover:bg-blue-600 text-white font-bold shadow-lg rounded-xl text-lg"
                        onClick={onBack}
                    >
                        RETURN TO LOBBY
                    </Button>
                </CardContent>
             </Card>
        </div>
    );
}
