import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'RMH Music | rmhstudios',
  description: 'Listen to Spotify with friends. Create rooms, share music, vibe together.',
};

export default function RmhMusicLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
