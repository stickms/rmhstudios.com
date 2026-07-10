'use client';

import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouletteStore } from '@/lib/roulette/store';
import { getRouletteSocket } from '@/lib/roulette/socket';
import { C2S } from '@/lib/roulette/events';
import { getNumberColor, getOutsideBetNumbers, WHEEL_ORDER, DOUBLE_ZERO, numberLabel } from '@/lib/roulette/logic';
import type { BetType } from '@/lib/roulette/logic';
import { CoinIcon } from './CoinIcon';

// ── Board Layout ─────────────────────────────────────────────────

const BOARD_ROWS: number[][] = [];
for (let row = 0; row < 12; row++) {
  const base = row * 3 + 1;
  BOARD_ROWS.push([base, base + 1, base + 2]);
}

const NUMBER_BG: Record<string, string> = {
  red: 'bg-red-600 hover:bg-red-500',
  black: 'bg-gray-800 hover:bg-gray-700',
  green: 'bg-emerald-700 hover:bg-emerald-600',
};

const NUMBER_BG_WIN: Record<string, string> = {
  red: 'bg-red-500 ring-2 ring-site-accent',
  black: 'bg-gray-700 ring-2 ring-site-accent',
  green: 'bg-emerald-600 ring-2 ring-site-accent',
};

const CELL_W = 64;
const REPEATS = 10;
const STRIP = Array.from({ length: WHEEL_ORDER.length * REPEATS }, (_, i) => WHEEL_ORDER[i % WHEEL_ORDER.length]);

function getCellBg(n: number) {
  const c = getNumberColor(n);
  return c === 'red' ? '#dc2626' : c === 'green' ? '#059669' : '#1f2937';
}

// ── Spinning Strip ──────────────────────────────────────────────

function SpinningWheel({ result }: { result: number | null }) {
  const stripRef = useRef<HTMLDivElement>(null);
  const [landed, setLanded] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState<number | null>(null);

  useEffect(() => {
    if (result === null || !stripRef.current) return;
    setLanded(false);
    setHighlightIdx(null);

    const midStart = Math.floor(REPEATS / 2) * WHEEL_ORDER.length;
    let targetIdx = midStart;
    for (let i = midStart; i < midStart + WHEEL_ORDER.length; i++) {
      if (STRIP[i] === result) { targetIdx = i; break; }
    }

    const viewportW = stripRef.current.parentElement?.clientWidth ?? 320;
    const offset = targetIdx * CELL_W + CELL_W / 2 - viewportW / 2;

    stripRef.current.style.transition = 'none';
    stripRef.current.style.transform = 'translateX(0px)';
    void stripRef.current.offsetHeight;

    stripRef.current.style.transition = 'transform 4s cubic-bezier(0.15, 0.9, 0.3, 1)';
    stripRef.current.style.transform = `translateX(-${offset}px)`;

    const timer = setTimeout(() => {
      setLanded(true);
      setHighlightIdx(targetIdx);
    }, 4200);

    return () => clearTimeout(timer);
  }, [result]);

  return (
    <div className="flex flex-col items-center gap-1 w-full">
      <div className="w-0 h-0" style={{
        borderLeft: '10px solid transparent',
        borderRight: '10px solid transparent',
        borderTop: '14px solid var(--site-accent)',
      }} />
      <div
        className="relative overflow-hidden rounded-xl border-2 border-site-accent/60"
        style={{ width: '100%', maxWidth: 420, height: 72 }}
      >
        <div ref={stripRef} className="flex absolute top-0 left-0 h-full" style={{ willChange: 'transform' }}>
          {STRIP.map((n, i) => {
            const isHighlight = landed && highlightIdx === i;
            return (
              <div
                key={i}
                className="shrink-0 flex items-center justify-center font-bold text-white text-lg border-r border-white/10"
                style={{
                  width: CELL_W,
                  height: '100%',
                  backgroundColor: getCellBg(n),
                  boxShadow: isHighlight ? 'inset 0 0 22px rgba(155, 122, 216, 0.65)' : undefined,
                  outline: isHighlight ? '3px solid var(--site-accent)' : undefined,
                  transition: isHighlight ? 'box-shadow 0.3s, outline 0.3s' : undefined,
                }}
              >
                {numberLabel(n)}
              </div>
            );
          })}
        </div>
      </div>
      <div className="w-0 h-0" style={{
        borderLeft: '10px solid transparent',
        borderRight: '10px solid transparent',
        borderBottom: '14px solid var(--site-accent)',
      }} />
    </div>
  );
}

// ── Winning Number Display ──────────────────────────────────────

function WinningNumberDisplay({ number: num }: { number: number }) {
  const { t } = useTranslation("c-rmhcoins");
  const color = getNumberColor(num);
  const bg = color === 'red' ? '#dc2626' : color === 'green' ? '#059669' : '#1f2937';

  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-xs text-site-text-dim uppercase tracking-wider font-bold">{t("winning-number", { defaultValue: "Winning Number" })}</span>
      <div
        className="flex items-center justify-center rounded-full text-white font-black text-2xl sm:text-3xl shadow-2xl"
        style={{
          width: 70,
          height: 70,
          backgroundColor: bg,
          boxShadow: `0 0 30px ${color === 'red' ? 'rgba(220,38,38,0.5)' : color === 'green' ? 'rgba(5,150,105,0.5)' : 'rgba(31,41,55,0.5)'}, 0 0 0 4px rgba(155,122,216,0.5)`,
        }}
      >
        {numberLabel(num)}
      </div>
    </div>
  );
}

// ── Bet dot styles ──────────────────────────────────────────────

const DOT_BASE = 'absolute z-20 rounded-full transition-all opacity-0 hover:opacity-100 hover:scale-125';
const DOT_IDLE = `${DOT_BASE} bg-site-accent/70 border border-site-accent shadow-sm`;
const DOT_SIZE = 'w-5 h-5 sm:w-4 sm:h-4';

// ── Main Table ──────────────────────────────────────────────────

interface Props {
  coins: number;
}

export function RouletteTable({ coins }: Props) {
  const {
    tablePhase,
    stagedBets,
    spinResult,
    history,
    players,
    myUserId,
    lastRoundResult,
  } = useRouletteStore();

  const { t } = useTranslation("c-rmhcoins");
  const addStagedBet = useRouletteStore((s) => s.addStagedBet);

  const isBetting = tablePhase === 'betting';
  // Only highlight winner AFTER animation finishes (results phase), not during spinning
  const winningNumber = tablePhase === 'results' ? spinResult : null;

  // During betting use staged bets; during spinning/results use server bets so they persist
  const chipMap = useMemo(() => {
    const map = new Map<string, number>();
    if (isBetting) {
      for (const bet of stagedBets) {
        const key = bet.type + ':' + [...bet.numbers].sort((a, b) => a - b).join(',');
        map.set(key, (map.get(key) ?? 0) + bet.amount);
      }
    } else {
      const myPlayer = players.find((p) => p.userId === myUserId);
      if (myPlayer) {
        for (const bet of myPlayer.bets) {
          const key = bet.type + ':' + [...bet.numbers].sort((a, b) => a - b).join(',');
          map.set(key, (map.get(key) ?? 0) + bet.amount);
        }
      }
    }
    return map;
  }, [stagedBets, isBetting, players, myUserId]);

  const getChipAmount = useCallback((type: BetType, numbers: number[]) => {
    const key = type + ':' + [...numbers].sort((a, b) => a - b).join(',');
    return chipMap.get(key) ?? 0;
  }, [chipMap]);

  const handlePlaceBet = useCallback((type: BetType, numbers: number[]) => {
    if (!isBetting) return;
    const chipValue = getSelectedChipValue();
    if (chipValue > coins) return;

    addStagedBet({ type, numbers, amount: chipValue });

    const sock = getRouletteSocket();
    if (sock) {
      sock.emit(C2S.PLACE_BET, { type, numbers, amount: chipValue });
    }
  }, [isBetting, coins, addStagedBet]);

  function ChipOverlay({ type, numbers }: { type: BetType; numbers: number[] }) {
    const amount = getChipAmount(type, numbers);
    if (amount <= 0) return null;
    return (
      <div className="absolute -top-1 -right-1 z-30 flex items-center gap-0.5 bg-site-accent text-site-accent-fg text-[8px] font-bold rounded-full px-1 py-0.5 shadow-lg border border-site-accent/60">
        <CoinIcon className="w-2 h-2" />
        {amount}
      </div>
    );
  }

  // Chip overlay positioned at a specific edge/corner (for split/corner bets on the board)
  function EdgeChip({ type, numbers, style }: { type: BetType; numbers: number[]; style: React.CSSProperties }) {
    const amount = getChipAmount(type, numbers);
    if (amount <= 0) return null;
    return (
      <div
        className="absolute z-30 flex items-center justify-center bg-site-accent text-site-accent-fg text-[7px] font-bold rounded-full shadow-lg border border-site-accent/60"
        style={{ width: 18, height: 18, ...style }}
      >
        {amount}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Spinning animation */}
      {tablePhase === 'spinning' && (
        <SpinningWheel result={spinResult} />
      )}

      {/* Results - show winning number prominently */}
      {tablePhase === 'results' && spinResult !== null && (
        <WinningNumberDisplay number={spinResult} />
      )}

      {/* Roulette Board — horizontally scrollable on very small screens */}
      <div className="w-full overflow-x-auto -mx-1 px-1">
        <div className="inline-flex flex-col gap-0.5 min-w-70 w-full max-w-md mx-auto">
          {/* 0 and 00 row */}
          <div className="grid grid-cols-2 gap-0.5">
            {[0, DOUBLE_ZERO].map((n) => (
              <button
                key={n}
                onClick={() => handlePlaceBet('straight', [n])}
                disabled={!isBetting}
                className={`relative min-h-10 sm:h-10 rounded-t-lg text-white font-bold text-sm transition-all active:scale-95 ${
                  winningNumber === n ? NUMBER_BG_WIN.green : NUMBER_BG.green
                } ${isBetting ? 'cursor-pointer' : 'cursor-default'}`}
              >
                {numberLabel(n)}
                <ChipOverlay type="straight" numbers={[n]} />
              </button>
            ))}
          </div>

          {/* Top line bet (0, 00, 1, 2, 3) */}
          {isBetting && (
            <button
              onClick={() => handlePlaceBet('topline', [0, DOUBLE_ZERO, 1, 2, 3])}
              className="w-full min-h-7 bg-site-surface border border-site-border text-site-text text-[10px] font-bold rounded transition-all hover:bg-site-surface-hover active:scale-[0.98] relative"
            >
              {t("top-line-bet", { defaultValue: "Top Line (0, 00, 1-3) 6:1" })}
              <ChipOverlay type="topline" numbers={[0, DOUBLE_ZERO, 1, 2, 3]} />
            </button>
          )}

          {/* Number grid: 12 rows x 3 columns with interactive edge/corner bet dots */}
          <div className="grid grid-cols-3" style={{ gap: 2 }}>
            {BOARD_ROWS.map((row, rowIdx) =>
              row.map((n, colIdx) => {
                const color = getNumberColor(n);
                const isWinner = winningNumber === n;
                const hasRight = colIdx < 2;
                const hasBelow = rowIdx < 11;

                return (
                  <div key={n} className="relative" style={{ overflow: 'visible' }}>
                    {/* Main number — straight bet */}
                    <button
                      onClick={() => handlePlaceBet('straight', [n])}
                      disabled={!isBetting}
                      className={`relative w-full min-h-9 sm:h-9 text-white font-bold text-xs rounded transition-all active:scale-95 ${
                        isWinner ? NUMBER_BG_WIN[color] : NUMBER_BG[color]
                      } ${isBetting ? 'cursor-pointer' : 'cursor-default'}`}
                    >
                      {n}
                      <ChipOverlay type="straight" numbers={[n]} />
                    </button>

                    {/* Right edge dot — vertical split (n, n+1) */}
                    {isBetting && hasRight && (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); handlePlaceBet('split', [n, n + 1]); }}
                          className={`${DOT_IDLE} ${DOT_SIZE}`}
                          style={{ top: '50%', right: -3, transform: 'translate(50%, -50%)' }}
                          title={`Split ${n}/${n + 1}`}
                        />
                        <EdgeChip type="split" numbers={[n, n + 1]} style={{ top: '50%', right: -3, transform: 'translate(50%, -50%)' }} />
                      </>
                    )}

                    {/* Bottom edge dot — horizontal split (n, n+3) */}
                    {isBetting && hasBelow && (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); handlePlaceBet('split', [n, n + 3]); }}
                          className={`${DOT_IDLE} ${DOT_SIZE}`}
                          style={{ bottom: -3, left: '50%', transform: 'translate(-50%, 50%)' }}
                          title={`Split ${n}/${n + 3}`}
                        />
                        <EdgeChip type="split" numbers={[n, n + 3]} style={{ bottom: -3, left: '50%', transform: 'translate(-50%, 50%)' }} />
                      </>
                    )}

                    {/* Bottom-right corner dot — corner bet (n, n+1, n+3, n+4) */}
                    {isBetting && hasRight && hasBelow && (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); handlePlaceBet('corner', [n, n + 1, n + 3, n + 4]); }}
                          className={`${DOT_IDLE} ${DOT_SIZE}`}
                          style={{ bottom: -3, right: -3, transform: 'translate(50%, 50%)' }}
                          title={`Corner ${n}/${n + 1}/${n + 3}/${n + 4}`}
                        />
                        <EdgeChip type="corner" numbers={[n, n + 1, n + 3, n + 4]} style={{ bottom: -3, right: -3, transform: 'translate(50%, 50%)' }} />
                      </>
                    )}

                    {/* Left edge dot — street bet (row of 3) */}
                    {isBetting && colIdx === 0 && (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); handlePlaceBet('street', [n, n + 1, n + 2]); }}
                          className={`${DOT_IDLE} ${DOT_SIZE}`}
                          style={{ top: '50%', left: -3, transform: 'translate(-50%, -50%)' }}
                          title={`Street ${n}-${n + 2}`}
                        />
                        <EdgeChip type="street" numbers={[n, n + 1, n + 2]} style={{ top: '50%', left: -3, transform: 'translate(-50%, -50%)' }} />
                      </>
                    )}

                    {/* Bottom-left dot — line bet (two streets: this row + next) */}
                    {isBetting && colIdx === 0 && hasBelow && (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); handlePlaceBet('line', [n, n + 1, n + 2, n + 3, n + 4, n + 5]); }}
                          className={`${DOT_IDLE} ${DOT_SIZE}`}
                          style={{ bottom: -3, left: -3, transform: 'translate(-50%, 50%)' }}
                          title={`Line ${n}-${n + 5}`}
                        />
                        <EdgeChip type="line" numbers={[n, n + 1, n + 2, n + 3, n + 4, n + 5]} style={{ bottom: -3, left: -3, transform: 'translate(-50%, 50%)' }} />
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Column bets */}
          <div className="grid grid-cols-3 gap-0.5">
            {(['column1', 'column2', 'column3'] as BetType[]).map((type, i) => (
              <button
                key={type}
                onClick={() => handlePlaceBet(type, getOutsideBetNumbers(type))}
                disabled={!isBetting}
                className={`relative min-h-9 bg-site-surface border border-site-border text-site-text text-[10px] sm:text-[11px] font-bold rounded transition-all hover:bg-site-surface-hover active:scale-95 ${
                  isBetting ? 'cursor-pointer' : 'cursor-default'
                }`}
              >
                {t("col-n", { defaultValue: "Col {{col}}", col: i + 1 })}
                <ChipOverlay type={type} numbers={getOutsideBetNumbers(type)} />
              </button>
            ))}
          </div>

          {/* Dozen bets */}
          <div className="grid grid-cols-3 gap-0.5">
            {(['dozen1', 'dozen2', 'dozen3'] as BetType[]).map((type, i) => (
              <button
                key={type}
                onClick={() => handlePlaceBet(type, getOutsideBetNumbers(type))}
                disabled={!isBetting}
                className={`relative min-h-9 bg-site-surface border border-site-border text-site-text text-[10px] sm:text-[11px] font-bold rounded transition-all hover:bg-site-surface-hover active:scale-95 ${
                  isBetting ? 'cursor-pointer' : 'cursor-default'
                }`}
              >
                {i === 0 ? t("dozen-1st", { defaultValue: "1st 12" }) : i === 1 ? t("dozen-2nd", { defaultValue: "2nd 12" }) : t("dozen-3rd", { defaultValue: "3rd 12" })}
                <ChipOverlay type={type} numbers={getOutsideBetNumbers(type)} />
              </button>
            ))}
          </div>

          {/* Outside bets — 3 columns on mobile for bigger targets, 6 on desktop */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-0.5">
            {([
              { type: 'low' as BetType, label: '1-18', key: 'low' },
              { type: 'even' as BetType, label: 'Even', key: 'even' },
              { type: 'red' as BetType, label: 'Red', key: 'red' },
              { type: 'black' as BetType, label: 'Black', key: 'black' },
              { type: 'odd' as BetType, label: 'Odd', key: 'odd' },
              { type: 'high' as BetType, label: '19-36', key: 'high' },
            ]).map(({ type, label, key }) => (
              <button
                key={type}
                onClick={() => handlePlaceBet(type, getOutsideBetNumbers(type))}
                disabled={!isBetting}
                className={`relative min-h-9 text-[11px] font-bold rounded transition-all active:scale-95 ${
                  isBetting ? 'cursor-pointer' : 'cursor-default'
                } ${
                  type === 'red'
                    ? 'bg-red-600 hover:bg-red-500 text-white'
                    : type === 'black'
                    ? 'bg-gray-800 hover:bg-gray-700 text-white'
                    : 'bg-site-surface border border-site-border text-site-text hover:bg-site-surface-hover'
                }`}
              >
                {t(`outside-${key}`, { defaultValue: label })}
                <ChipOverlay type={type} numbers={getOutsideBetNumbers(type)} />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="flex flex-col items-center gap-1 w-full">
          <span className="text-[10px] text-site-text-dim uppercase tracking-wider font-bold">{t("history", { defaultValue: "History" })}</span>
          <div className="flex gap-1 flex-wrap justify-center">
            {history.slice(-15).map((n, i) => {
              const color = getNumberColor(n);
              return (
                <span
                  key={`${n}-${i}`}
                  className={`inline-flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 rounded-full text-[9px] sm:text-[10px] font-bold text-white ${
                    color === 'red' ? 'bg-red-600'
                    : color === 'green' ? 'bg-emerald-600'
                    : 'bg-gray-800'
                  }`}
                >
                  {numberLabel(n)}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Players at table */}
      {players.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2 w-full">
          {players
            .sort((a, b) => a.seatIndex - b.seatIndex)
            .map((player) => {
              const isMe = player.userId === myUserId;
              const myPayout = lastRoundResult?.payouts.find((p) => p.userId === player.userId);
              return (
                <div
                  key={player.userId}
                  className={`flex flex-col items-center gap-0.5 p-2 rounded-lg ${isMe ? 'bg-site-surface/50' : ''}`}
                >
                  <div className="flex items-center gap-1">
                    {player.avatarUrl ? (
                      <img src={player.avatarUrl} alt="" className="w-4 h-4 rounded-full" />
                    ) : null}
                    <span className={`text-xs font-bold truncate max-w-15 ${isMe ? 'text-site-accent' : 'text-site-text'}`}>
                      {isMe ? t("you", { defaultValue: "You" }) : player.userName}
                    </span>
                  </div>
                  {player.totalBetThisRound > 0 && (
                    <div className="flex items-center gap-0.5">
                      <CoinIcon className="w-3 h-3" />
                      <span className="text-[10px] text-yellow-500 font-bold">{player.totalBetThisRound}</span>
                    </div>
                  )}
                  {tablePhase === 'results' && myPayout && myPayout.netGain > 0 && (
                    <span className="text-[10px] text-site-success font-bold animate-bounce">+{myPayout.payout}</span>
                  )}
                  {tablePhase === 'results' && myPayout && myPayout.netGain < 0 && (
                    <span className="text-[10px] text-site-danger font-bold">{myPayout.netGain}</span>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

// ── Chip Value Global ────────────────────────────────────────────

let _selectedChipValue = 5;

export function setSelectedChipValue(val: number) {
  _selectedChipValue = val;
}

export function getSelectedChipValue(): number {
  return _selectedChipValue;
}
