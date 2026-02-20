import type { Metadata } from 'next';
import { Cormorant_Garamond } from 'next/font/google';

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-cormorant',
});

export const metadata: Metadata = {
  title: 'Temple of Joy',
  description: 'An idle clicker game about the pursuit of happiness. Build your temple, earn joy, transcend.',
};

export default function TempleOfJoyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${cormorant.variable} font-sans`}>
      {children}
    </div>
  );
}
