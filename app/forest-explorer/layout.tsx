import type { Metadata, Viewport } from 'next';

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
};

export const metadata: Metadata = {
    title: 'Forest Explorer — RMH Studios',
    description: 'Wander through a peaceful 3D ancient forest filled with fireflies and morning mist.',
};

export default function ForestExplorerLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
