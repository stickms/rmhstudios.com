/**
 * IdentityCard — Displays a player's known identity with their name.
 *
 * Shows a card with the player's name and assigned identity.
 * Uses a category-themed accent color highlight when isHighlighted is true.
 *
 * Props:
 *   userId: string — Player's user ID
 *   userName: string — Player's display name
 *   identity: string — The identity assigned to this player
 *   isHighlighted?: boolean — Whether to highlight with accent color
 */
'use client';

import { User } from 'lucide-react';

interface IdentityCardProps {
  userId: string;
  userName: string;
  identity: string;
  isHighlighted?: boolean;
}

export default function IdentityCard({ userId: _userId, userName, identity, isHighlighted = false }: IdentityCardProps) {
  void _userId;

  return (
    <div
      className={`flex flex-col items-center gap-1.5 rounded-xl border px-4 py-3 transition-colors ${
        isHighlighted
          ? 'border-(--rmhbox-accent) bg-(--rmhbox-accent)/10'
          : 'border-(--rmhbox-border) bg-(--rmhbox-surface)'
      }`}
    >
      <div className="flex items-center gap-1.5">
        <User className="h-3.5 w-3.5 text-(--rmhbox-text-muted)" />
        <span className="text-xs font-medium text-(--rmhbox-text-muted)">{userName}</span>
      </div>
      <span
        className={`text-sm font-bold ${
          isHighlighted ? 'text-(--rmhbox-accent)' : 'text-(--rmhbox-text)'
        }`}
      >
        {identity}
      </span>
    </div>
  );
}
