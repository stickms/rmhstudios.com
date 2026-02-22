import type { Metadata } from 'next';
import { JetBrains_Mono } from 'next/font/google';

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'RMH Code',
  description: 'A browser-based code editor. Write and save code right in your browser.',
};

export default function RMHCodeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${jetbrainsMono.variable} h-screen w-screen overflow-hidden`}>
      {children}
    </div>
  );
}
