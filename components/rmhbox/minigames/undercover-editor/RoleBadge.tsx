/**
 * RoleBadge — Persistent role indicator for Undercover Editor.
 *
 * Displays a small badge showing the player's role.
 * Writers see "🔎 Writer". Editors see "✏️ Editor".
 *
 * Props:
 *   role: 'editor' | 'writer' — The player's assigned role
 */
'use client';

import { motion } from 'framer-motion';

interface RoleBadgeProps {
  role: 'editor' | 'writer';
}

export default function RoleBadge({ role }: RoleBadgeProps) {
  const isEditor = role === 'editor';

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
        isEditor
          ? 'bg-(--rmhbox-rare-dim) text-(--rmhbox-rare) border border-(--rmhbox-rare)/30'
          : 'bg-(--rmhbox-accent-dim) text-(--rmhbox-accent) border border-(--rmhbox-accent)/30'
      }`}
    >
      <span>{isEditor ? '✏️' : '🔎'}</span>
      <span>{isEditor ? 'Editor' : 'Writer'}</span>
    </motion.div>
  );
}
