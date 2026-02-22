'use client';
import { useEffect, useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { loadSynapseStormSave, saveSynapseStormScore } from '@/lib/synapse-storm/persistence';
import { SynapseStormGame } from './SynapseStormGame';
import { Loader2 } from 'lucide-react';

export function SynapseStormGate() {
    const session = authClient.useSession();
    const [loading, setLoading] = useState(true);
    const [highScore, setHighScore] = useState(0);

    useEffect(() => {
        async function init() {
            if (session.data) {
                const save = await loadSynapseStormSave();
                if (save && save.highScore) {
                    setHighScore(save.highScore);
                }
            }
            setLoading(false);
        }
        if (!session.isPending) {
            init();
        }
    }, [session.data, session.isPending]);

    const handleSaveScore = async (score: number) => {
        if (!session.data) return;
        if (score > highScore) {
            setHighScore(score);
            await saveSynapseStormScore(score);
        }
    };

    if (session.isPending || loading) {
        return (
            <div className="h-screen w-full flex items-center justify-center bg-[#0a0a1a]">
                <Loader2 className="w-12 h-12 text-cyan-500 animate-spin" />
            </div>
        );
    }

    if (!session.data) {
        return (
            <div className="h-screen w-full flex flex-col items-center justify-center bg-[#0a0a1a] text-white p-4">
                <h1 className="text-4xl font-black mb-4">SYNAPSE STORM</h1>
                <p className="text-gray-400 mb-8 max-w-md text-center">
                    Neural link unavailable. Please authenticate to initialize the storm.
                </p>
                <div className="p-1 rounded-lg bg-gradient-to-r from-cyan-500 to-pink-500">
                    <button
                        onClick={() => (window.location.href = '/login?callbackUrl=/synapse-storm')}
                        className="px-8 py-3 bg-[#0a0a1a] rounded-md font-bold hover:bg-transparent transition-colors"
                    >
                        LOGIN TO PLAY
                    </button>
                </div>
            </div>
        );
    }

    return (
        <SynapseStormGame onSaveScore={handleSaveScore} currentUserId={session.data.user.id} />
    );
}
