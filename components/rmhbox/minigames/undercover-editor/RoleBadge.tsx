/**
 * RoleBadge — Persistent role indicator for Undercover Editor.
 *
 * Displays a small badge in the corner showing the player's role.
 * Writers see "🔎 Writer". Editors see "✏️ Editor | Keyword: [word]".
 *
 * Props:
 *   role: 'editor' | 'writer' — The player's assigned role
 *   keyword?: string — The secret keyword (editor only)
 */
'use client';

import { motion } from 'framer-motion';

interface RoleBadgeProps {
  role: 'editor' | 'writer';
  keyword?: string;
}

export default function RoleBadge({ role, keyword }: RoleBadgeProps) {
  const isEditor = role === 'editor';

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
        isEditor
          ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
          : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
      }`}
    >
      <span>{isEditor ? '✏️' : '🔎'}</span>
      <span>{isEditor ? 'Editor' : 'Writer'}</span>
      {isEditor && keyword && (
        <>
          <span className="opacity-40">|</span>
          <span className="opacity-70">Keyword:</span>
          <span className="font-semibold text-purple-200">{keyword}</span>
        </>
      )}
    </motion.div>
  );
}
