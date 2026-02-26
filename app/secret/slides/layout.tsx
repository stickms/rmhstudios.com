import type { Metadata } from 'next';
import './globals.css';
import { Inter } from 'next/font/google';
const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
    title: 'RMH Slides',
    description: 'Professional presentation editor.',
};

export default function SlidesLayout({ children }: { children: React.ReactNode }) {
    return <div className={inter.className}>{children}</div>;
}
