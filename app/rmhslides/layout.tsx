import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  weight: ['400', '500', '600', '700', '800'],
});

export const metadata: Metadata = {
  title: 'RMH Slides',
  description: 'A collaborative slideshow editor. Create, present, and collaborate on beautiful presentations.',
};

export default function RMHSlidesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${inter.variable}`} style={{ fontFamily: 'var(--font-inter), ui-sans-serif, system-ui, sans-serif' }}>
      {children}
    </div>
  );
}
