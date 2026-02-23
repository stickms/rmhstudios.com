/**
 * RhymeTimeResults — Round results display for Rhyme Time.
 *
 * Shows all submitted words grouped by rarity tier (rare → uncommon → common).
 * Each word entry includes the word text, who submitted it, a color-coded
 * rarity badge, points earned, and a multi-syllable indicator.
 * The current player's words are highlighted. Speed bonus indicators
 * are shown where applicable. An animated score tally and per-player
 * breakdown (valid/invalid counts, round score) are displayed at the bottom.
 *
 * Props:
 *   rootWord: string — The root word for this round
 *   currentUserId: string — ID of the viewing player (to highlight own words)
 *   wordResults: WordResult[] — All scored words across all players
 *   playerBreakdowns: PlayerBreakdown[] — Per-player summary stats
 *   roundNumber: number — Current round number
 */
'use client';

import { motion } from 'framer-motion';
import { Sparkles, Zap, Star } from 'lucide-react';

export type RarityTier = 'rare' | 'uncommon' | 'common' | 'does_not_rhyme' | 'not_in_dict';

export interface WordResult {
  word: string;
  submittedBy: string;
  userId: string;
  rarity: RarityTier;
  points: number;
  multiSyllable: boolean;
  speedBonus: boolean;
}

export interface PlayerBreakdown {
  userId: string;
  userName: string;
  validCount: number;
  invalidCount: number;
  roundScore: number;
}

interface RhymeTimeResultsProps {
  rootWord: string;
  currentUserId: string;
  wordResults: WordResult[];
  playerBreakdowns: PlayerBreakdown[];
  roundNumber: number;
}

const RARITY_CONFIG: Record<RarityTier, { label: string; color: string; bg: string }> = {
  rare:           { label: 'Rare',             color: 'text-purple-300', bg: 'bg-purple-500/20 border-purple-500/40' },
  uncommon:       { label: 'Uncommon',         color: 'text-blue-300',   bg: 'bg-blue-500/20 border-blue-500/40' },
  common:         { label: 'Common',           color: 'text-gray-300',   bg: 'bg-gray-500/20 border-gray-500/40' },
  does_not_rhyme: { label: "Doesn't Rhyme",    color: 'text-red-400',    bg: 'bg-red-500/20 border-red-500/40' },
  not_in_dict:    { label: 'Not In Dictionary', color: 'text-gray-500',   bg: 'bg-gray-500/10 border-gray-600/30' },
};

const TIER_ORDER: RarityTier[] = ['rare', 'uncommon', 'common', 'does_not_rhyme', 'not_in_dict'];

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

export default function RhymeTimeResults({
  rootWord,
  currentUserId,
  wordResults,
  playerBreakdowns,
  roundNumber,
}: RhymeTimeResultsProps) {
  const groupedByRarity = TIER_ORDER.map((tier) => ({
    tier,
    words: wordResults.filter((w) => w.rarity === tier),
  })).filter((g) => g.words.length > 0);

  return (
    <motion.div
      className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-4 text-(--rmhbox-text)"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="text-center">
        <h2 className="text-2xl font-bold">Round {roundNumber} Results</h2>
        <p className="mt-1 text-sm text-(--rmhbox-text-muted)">
          Root word: <span className="font-semibold text-(--rmhbox-accent)">{rootWord}</span>
        </p>
      </motion.div>

      {/* Words grouped by rarity */}
      {groupedByRarity.map(({ tier, words }) => {
        const config = RARITY_CONFIG[tier];
        const isInvalid = tier === 'does_not_rhyme' || tier === 'not_in_dict';
        return (
          <motion.div
            key={tier}
            variants={itemVariants}
            className="rounded-xl border border-(--rmhbox-border) bg-(--rmhbox-surface) p-3"
          >
            <h3 className={`mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider ${config.color}`}>
              {tier === 'rare' && <Sparkles className="h-4 w-4" />}
              {config.label} — {words.length} word{words.length !== 1 ? 's' : ''}
            </h3>
            <ul className="space-y-1">
              {words.map((w, i) => {
                const isOwn = w.userId === currentUserId;
                return (
                  <li
                    key={`${w.word}-${i}`}
                    className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-sm ${
                      isOwn ? 'bg-(--rmhbox-accent)/10 ring-1 ring-(--rmhbox-accent)/30' : ''
                    } ${isInvalid ? 'opacity-60' : ''}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`font-semibold ${tier === 'does_not_rhyme' ? 'line-through text-red-400' : ''} ${tier === 'not_in_dict' ? 'text-gray-500' : ''}`}>
                        {w.word}
                      </span>
                      {w.multiSyllable && (
                        <span className="rounded-full bg-yellow-500/20 px-1.5 py-0.5 text-[10px] font-medium text-yellow-300 border border-yellow-500/30">
                          multi
                        </span>
                      )}
                      {w.speedBonus && (
                        <span title="Speed bonus"><Zap className="h-3.5 w-3.5 text-amber-400" /></span>
                      )}
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${config.bg} ${config.color}`}>
                        {config.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-(--rmhbox-text-muted)">{w.submittedBy}</span>
                      <span className={`font-mono font-semibold ${w.points < 0 ? 'text-red-400' : w.points === 0 ? 'text-gray-500' : 'text-(--rmhbox-accent)'}`}>
                        {w.points > 0 ? '+' : ''}{w.points}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        );
      })}

      {/* Per-player breakdown */}
      <motion.div
        variants={itemVariants}
        className="rounded-xl border border-(--rmhbox-border) bg-(--rmhbox-surface) p-3"
      >
        <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-(--rmhbox-text-muted)">
          <Star className="h-4 w-4" /> Player Breakdown
        </h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-(--rmhbox-text-muted)">
              <th className="pb-1.5 font-medium">Player</th>
              <th className="pb-1.5 text-right font-medium">Valid</th>
              <th className="pb-1.5 text-right font-medium">Invalid</th>
              <th className="pb-1.5 text-right font-medium">Score</th>
            </tr>
          </thead>
          <tbody>
            {playerBreakdowns
              .sort((a, b) => b.roundScore - a.roundScore)
              .map((p) => (
                <tr
                  key={p.userId}
                  className={`border-t border-(--rmhbox-border) ${
                    p.userId === currentUserId ? 'text-(--rmhbox-accent)' : ''
                  }`}
                >
                  <td className="py-1 font-medium">{p.userName}</td>
                  <td className="py-1 text-right font-mono text-green-400">{p.validCount}</td>
                  <td className="py-1 text-right font-mono text-red-400">{p.invalidCount}</td>
                  <td className="py-1 text-right font-mono font-bold">{p.roundScore}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </motion.div>
    </motion.div>
  );
}
