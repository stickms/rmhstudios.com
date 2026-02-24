import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: 'RMH Docs',
  description: 'A professional collaborative word processor. Create, edit, and share documents in real time.',
};

export default function RMHDocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${inter.variable}`} style={{ fontFamily: 'var(--font-inter), ui-sans-serif, system-ui, sans-serif' }}>
      {children}
    </div>
  );
}
