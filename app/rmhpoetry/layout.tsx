import type { Metadata } from 'next';
import { EB_Garamond } from 'next/font/google';

const ebGaramond = EB_Garamond({
  subsets: ['latin'],
  variable: '--font-eb-garamond',
});

export const metadata: Metadata = {
  title: 'Versecraft: Whispers of the Muse | RMH Studios',
  description: 'A poetry puzzle visual novel. Join the Ivory Quill Society, compose poems, and romance six unique characters in this DDLC-inspired literary adventure.',
};

export default function VersecraftLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${ebGaramond.variable}`}>
      {children}
    </div>
  );
}
