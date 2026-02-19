import './globals.css';
import { Toaster } from 'sonner';
import type { Metadata } from 'next';
import { Outfit } from 'next/font/google';

const outfit = Outfit({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Slice It - RMH Studios',
  description: 'Rhythm game with a soft touch.',
};

export default function SliceItLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${outfit.className} slice-theme min-h-screen text-slate-700 dark:text-slate-200 transition-colors duration-300`}>
      {children}
      <Toaster />
    </div>
  );
}
