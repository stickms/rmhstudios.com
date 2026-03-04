'use client';
import { useEffect, useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { loadSynapseStormSave, saveSynapseStormScore, type ScoreSaveData } from '@/lib/synapse-storm/persistence';
import { SynapseStormGame } from './SynapseStormGame';
import { Loader2 } from 'lucide-react';

export function SynapseStormGate() {
    const session = authClient.useSession();
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function init() {
            if (session.data) {
                await loadSynapseStormSave();
            }
            setLoading(false);
        }
        if (!session.isPending) {
            init();
        }
    }, [session.data, session.isPending]);

    const handleSaveScore = async (data: ScoreSaveData) => {
        if (!session.data) return;
        await saveSynapseStormScore(data);
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
