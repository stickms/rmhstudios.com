'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useBlackjackStore } from '@/lib/blackjack/store';
import { CoinIcon } from './CoinIcon';

export function BlackjackSessionStats() {
  const players = useBlackjackStore((s) => s.players);
  const myUserId = useBlackjackStore((s) => s.myUserId);
  const { t } = useTranslation("c-rmhcoins");
  const [expanded, setExpanded] = useState(false);

  const sorted = [...players].sort((a, b) => {
    const aNet = a.sessionStats.totalWon - a.sessionStats.totalBet;
    const bNet = b.sessionStats.totalWon - b.sessionStats.totalBet;
    return bNet - aNet;
  });

  // Don't show if no hands played yet
  const anyPlayed = sorted.some((p) => p.sessionStats.handsPlayed > 0);
  if (!anyPlayed) return null;

  return (
    <div className="rounded-lg border border-site-border bg-site-surface/50 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold text-site-text-dim hover:text-site-text transition-colors"
      >
        <span>{t("session-stats", { defaultValue: "Session Stats" })}</span>
        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-site-text-dim border-b border-site-border">
                <th className="text-left py-1 font-medium">{t("player", { defaultValue: "Player" })}</th>
                <th className="text-right py-1 font-medium">{t("bet", { defaultValue: "Bet" })}</th>
                <th className="text-right py-1 font-medium">{t("won", { defaultValue: "Won" })}</th>
                <th className="text-right py-1 font-medium">{t("net", { defaultValue: "Net" })}</th>
                <th className="text-right py-1 font-medium">{t("wl", { defaultValue: "W/L" })}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => {
                const net = p.sessionStats.totalWon - p.sessionStats.totalBet;
                const isMe = p.userId === myUserId;
                return (
                  <tr key={p.userId} className={isMe ? 'text-yellow-400' : 'text-site-text'}>
                    <td className="py-1 font-bold truncate max-w-20">
                      {isMe ? t("you", { defaultValue: "You" }) : p.userName}
                    </td>
                    <td className="text-right py-1">
                      <span className="inline-flex items-center gap-0.5">
                        {p.sessionStats.totalBet}
                        <CoinIcon className="w-2.5 h-2.5" />
                      </span>
                    </td>
                    <td className="text-right py-1">
                      <span className="inline-flex items-center gap-0.5">
                        {p.sessionStats.totalWon}
                        <CoinIcon className="w-2.5 h-2.5" />
                      </span>
                    </td>
                    <td className={`text-right py-1 font-bold ${net > 0 ? 'text-emerald-400' : net < 0 ? 'text-red-400' : ''}`}>
                      {net > 0 ? '+' : ''}{net}
                    </td>
                    <td className="text-right py-1 text-site-text-dim">
                      {p.sessionStats.handsWon}/{p.sessionStats.handsPlayed}
                      {p.sessionStats.blackjacks > 0 && (
                        <span className="text-yellow-400 ml-0.5">({p.sessionStats.blackjacks} BJ)</span>
                      )}
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
