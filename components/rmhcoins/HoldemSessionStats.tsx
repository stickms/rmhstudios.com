'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useHoldemStore } from '@/lib/holdem/store';
import { CoinIcon } from './CoinIcon';

export function HoldemSessionStats() {
  const players = useHoldemStore((s) => s.players);
  const myUserId = useHoldemStore((s) => s.myUserId);
  const [expanded, setExpanded] = useState(false);

  const sorted = [...players].sort((a, b) => {
    const aNet = a.totalChips - a.sessionStats.totalBuyIn;
    const bNet = b.totalChips - b.sessionStats.totalBuyIn;
    return bNet - aNet;
  });

  const anyPlayed = sorted.some((p) => p.sessionStats.handsPlayed > 0);
  if (!anyPlayed) return null;

  return (
    <div className="rounded-lg border border-site-border bg-site-surface/50 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold text-site-text-dim hover:text-site-text transition-colors"
      >
        <span>Session Ledger</span>
        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-site-text-dim border-b border-site-border">
                <th className="text-left py-1 font-medium">Player</th>
                <th className="text-right py-1 font-medium">Buy-in</th>
                <th className="text-right py-1 font-medium">Stack</th>
                <th className="text-right py-1 font-medium">Net</th>
                <th className="text-right py-1 font-medium">W/L</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => {
                const net = p.totalChips - p.sessionStats.totalBuyIn;
                const isMe = p.userId === myUserId;
                return (
                  <tr key={p.userId} className={isMe ? 'text-emerald-400' : 'text-site-text'}>
                    <td className="py-1 font-bold truncate max-w-20">
                      {isMe ? 'You' : p.userName}
                      {p.sittingOut && <span className="text-orange-400 ml-1 text-[9px]">(out)</span>}
                    </td>
                    <td className="text-right py-1">
                      <span className="inline-flex items-center gap-0.5">
                        {p.sessionStats.totalBuyIn}
                        <CoinIcon className="w-2.5 h-2.5" />
                      </span>
                    </td>
                    <td className="text-right py-1">
                      <span className="inline-flex items-center gap-0.5">
                        {p.totalChips}
                        <CoinIcon className="w-2.5 h-2.5" />
                      </span>
                    </td>
                    <td className={`text-right py-1 font-bold ${net > 0 ? 'text-emerald-400' : net < 0 ? 'text-red-400' : ''}`}>
                      {net > 0 ? '+' : ''}{net}
                    </td>
                    <td className="text-right py-1 text-site-text-dim">
                      {p.sessionStats.handsWon}/{p.sessionStats.handsPlayed}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
