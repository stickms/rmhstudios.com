import type { Metadata, Viewport } from 'next';
import { Press_Start_2P } from 'next/font/google';

const pressStart2P = Press_Start_2P({ weight: '400', subsets: ['latin'] });

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
};

export const metadata: Metadata = {
    title: 'Kowloon Knockout — RMH Studios',
    description: 'A 2D retro pixel-art boxing game set in 90s Hong Kong. Choose your fighter, master combos, and battle in single-player or versus mode.',
};

export default function KowloonKnockoutLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className={pressStart2P.className} style={{ width: '100vw', height: '100vh' }}>
            {children}
        </div>
    );
}
