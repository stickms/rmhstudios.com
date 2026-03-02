import type { Metadata } from 'next';
import './globals.css';
import { Inter } from 'next/font/google';
const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
    title: 'RMH Sheets',
    description: 'Professional spreadsheet editor.',
};

export default function SheetsLayout({ children }: { children: React.ReactNode }) {
    return <div className={inter.className}>{children}</div>;
}
