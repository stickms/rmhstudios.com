'use client';

import { GameInterface } from '@/components/echoes/GameInterface';

export default function EchoesPage() {
    return (
        <main className="min-h-screen bg-black text-white selection:bg-neon-purple selection:text-white">
            <GameInterface />
        </main>
    );
}
