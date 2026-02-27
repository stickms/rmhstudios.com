/**
 * Altair Multiplayer Layout
 *
 * Inherits auth gate and AltairShell from parent /altair/ layout.
 * Provides multiplayer-specific metadata.
 */

export const metadata = {
  title: 'Altair — Multiplayer Co-op',
  description: '2-4 player co-op survivor roguelite',
};

export default function AltairMultiplayerLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
