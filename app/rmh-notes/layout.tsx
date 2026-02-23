import type { Metadata } from 'next';
import { Nunito } from 'next/font/google';
import './globals.css';

const nunito = Nunito({
  subsets: ['latin'],
  variable: '--font-nunito',
  weight: ['400', '500', '600', '700', '800'],
});

export const metadata: Metadata = {
  title: 'RMHNotes',
  description: 'A cozy, feature-rich notes and reminders app. Capture ideas, set reminders, and stay organized.',
};

export default function RMHNotesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${nunito.variable}`} style={{ fontFamily: 'var(--font-nunito), ui-sans-serif, system-ui, sans-serif' }}>
      {children}
    </div>
  );
}
