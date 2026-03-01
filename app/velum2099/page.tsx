import { Velum2099Game } from '@/components/velum2099/Velum2099Game';
import type { Metadata, Viewport } from 'next';

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
};

export const metadata: Metadata = {
    title: 'VELUM2099 — RMH Studios',
    description:
        'Cyberpunk driving simulator with procedural city generation, drift physics, and VHS post-processing.',
};

export default function Velum2099Page() {
    return (
        <main
            className="fixed inset-0 bg-black flex flex-col overflow-hidden"
            style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
        >
            <Velum2099Game />
        </main>
    );
}
