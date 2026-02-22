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
        window.location.href = '/login?callbackURL=/synapse-storm';
        return (
            <div className="h-screen w-full flex items-center justify-center bg-[#0a0a1a]">
                <Loader2 className="w-12 h-12 text-cyan-500 animate-spin" />
            </div>
        );
    }

    return (
        <SynapseStormGame onSaveScore={handleSaveScore} currentUserId={session.data.user.id} />
    );
}
