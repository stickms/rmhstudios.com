'use client';

import { useMemo } from 'react';
import { useRouletteStore } from '@/lib/roulette/store';
import { getRouletteSocket } from '@/lib/roulette/socket';
import { C2S } from '@/lib/roulette/events';
import { getNumberColor, getOutsideBetNumbers, WHEEL_ORDER } from '@/lib/roulette/logic';
import type { BetType } from '@/lib/roulette/logic';
import { CoinIcon } from './CoinIcon';

// ── Board Layout ─────────────────────────────────────────────────

/** Row-by-row layout: each row has 3 numbers, left-to-right = col3, col2, col1 visually */
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
  red: 'bg-red-500 ring-2 ring-yellow-400',
  black: 'bg-gray-700 ring-2 ring-yellow-400',
  green: 'bg-emerald-600 ring-2 ring-yellow-400',
};

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

  const addStagedBet = useRouletteStore((s) => s.addStagedBet);

  const isBetting = tablePhase === 'betting';
  const winningNumber = tablePhase === 'results' || tablePhase === 'spinning' ? spinResult : null;

  // Calculate total chips placed on each bet area
  const chipMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const bet of stagedBets) {
      const key = bet.type + ':' + bet.numbers.join(',');
      map.set(key, (map.get(key) ?? 0) + bet.amount);
    }
    // Also include confirmed bets from server for my player
    const myPlayer = players.find((p) => p.userId === myUserId);
    if (myPlayer) {
      for (const bet of myPlayer.bets) {
        const key = bet.type + ':' + bet.numbers.join(',');
        map.set(key, (map.get(key) ?? 0) + bet.amount);
      }
    }
    return map;
  }, [stagedBets, players, myUserId]);

  const getChipAmount = (type: BetType, numbers: number[]) => {
    const key = type + ':' + numbers.join(',');
    return chipMap.get(key) ?? 0;
  };

  const handlePlaceBet = (type: BetType, numbers: number[]) => {
    if (!isBetting) return;
    // Get chip value from the store's staged bets context — use default 5 if nothing selected
    // The chip value is managed by the controls component via a global approach
    const chipValue = getSelectedChipValue();
    if (chipValue > coins) return;

    addStagedBet({ type, numbers, amount: chipValue });

    // Emit to server
    const sock = getRouletteSocket();
    if (sock) {
      sock.emit(C2S.PLACE_BET, { type, numbers, amount: chipValue });
    }
  };

  // Chip overlay
  function ChipOverlay({ type, numbers }: { type: BetType; numbers: number[] }) {
    const amount = getChipAmount(type, numbers);
    if (amount <= 0) return null;
    return (
      <div className="absolute -top-1 -right-1 z-10 flex items-center gap-0.5 bg-violet-600 text-white text-[8px] font-bold rounded-full px-1 py-0.5 shadow-lg border border-violet-400">
        <CoinIcon className="w-2 h-2" />
        {amount}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Spinning animation */}
      {tablePhase === 'spinning' && (
        <div className="flex flex-col items-center gap-2">
          <div className="relative w-32 h-32">
            {/* Wheel */}
            <div className="absolute inset-0 rounded-full border-4 border-violet-500/50 animate-spin" style={{ animationDuration: '2s' }}>
              {WHEEL_ORDER.map((n, i) => {
                const angle = (i / WHEEL_ORDER.length) * 360;
                const color = getNumberColor(n);
                const dotColor = color === 'red' ? 'bg-red-500' : color === 'black' ? 'bg-gray-800' : 'bg-emerald-500';
                return (
                  <div
                    key={n}
                    className={`absolute w-2 h-2 rounded-full ${dotColor}`}
                    style={{
                      top: `${50 - 42 * Math.cos((angle * Math.PI) / 180)}%`,
                      left: `${50 + 42 * Math.sin((angle * Math.PI) / 180)}%`,
                      transform: 'translate(-50%, -50%)',
                    }}
                  />
                );
              })}
            </div>
            {/* Ball */}
            <div
              className="absolute w-3 h-3 bg-white rounded-full shadow-lg animate-bounce z-10"
              style={{ top: '10%', left: '50%', transform: 'translate(-50%, -50%)' }}
            />
            {/* Center */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xs font-bold text-violet-400 animate-pulse">Spinning...</span>
            </div>
          </div>
          {spinResult !== null && (
            <div className={`mt-2 text-2xl font-bold px-4 py-2 rounded-lg ${
              getNumberColor(spinResult) === 'red' ? 'bg-red-600 text-white'
              : getNumberColor(spinResult) === 'green' ? 'bg-emerald-600 text-white'
              : 'bg-gray-800 text-white'
            } animate-bounce`}>
              {spinResult}
            </div>
          )}
        </div>
      )}

      {/* Roulette Board */}
      <div className="w-full overflow-x-auto">
        <div className="inline-flex flex-col gap-0.5 min-w-[320px] mx-auto">
          {/* Zero */}
          <button
            onClick={() => handlePlaceBet('straight', [0])}
            disabled={!isBetting}
            className={`relative w-full h-10 rounded-t-lg text-white font-bold text-sm transition-all ${
              winningNumber === 0 ? NUMBER_BG_WIN.green : NUMBER_BG.green
            } ${isBetting ? 'cursor-pointer' : 'cursor-default'}`}
          >
            0
            <ChipOverlay type="straight" numbers={[0]} />
          </button>

          {/* Number grid: 12 rows x 3 columns */}
          <div className="grid grid-cols-3 gap-0.5">
            {BOARD_ROWS.map((row) =>
              row.map((n) => {
                const color = getNumberColor(n);
                const isWinner = winningNumber === n;
                return (
                  <button
                    key={n}
                    onClick={() => handlePlaceBet('straight', [n])}
                    disabled={!isBetting}
                    className={`relative h-9 text-white font-bold text-xs rounded transition-all ${
                      isWinner ? NUMBER_BG_WIN[color] : NUMBER_BG[color]
                    } ${isBetting ? 'cursor-pointer' : 'cursor-default'}`}
                  >
                    {n}
                    <ChipOverlay type="straight" numbers={[n]} />
                  </button>
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
                className={`relative h-8 bg-site-surface border border-site-border text-site-text text-[10px] font-bold rounded transition-all hover:bg-site-surface-hover ${
                  isBetting ? 'cursor-pointer' : 'cursor-default'
                }`}
              >
                Col {i + 1}
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
                className={`relative h-8 bg-site-surface border border-site-border text-site-text text-[10px] font-bold rounded transition-all hover:bg-site-surface-hover ${
                  isBetting ? 'cursor-pointer' : 'cursor-default'
                }`}
              >
                {i === 0 ? '1st 12' : i === 1 ? '2nd 12' : '3rd 12'}
                <ChipOverlay type={type} numbers={getOutsideBetNumbers(type)} />
              </button>
            ))}
          </div>

          {/* Outside bets: low/high, even/odd, red/black */}
          <div className="grid grid-cols-6 gap-0.5">
            {([
              { type: 'low' as BetType, label: '1-18' },
              { type: 'even' as BetType, label: 'Even' },
              { type: 'red' as BetType, label: 'Red' },
              { type: 'black' as BetType, label: 'Black' },
              { type: 'odd' as BetType, label: 'Odd' },
              { type: 'high' as BetType, label: '19-36' },
            ]).map(({ type, label }) => (
              <button
                key={type}
                onClick={() => handlePlaceBet(type, getOutsideBetNumbers(type))}
                disabled={!isBetting}
                className={`relative h-8 text-[10px] font-bold rounded transition-all ${
                  isBetting ? 'cursor-pointer' : 'cursor-default'
                } ${
                  type === 'red'
                    ? 'bg-red-600 hover:bg-red-500 text-white'
                    : type === 'black'
                    ? 'bg-gray-800 hover:bg-gray-700 text-white'
                    : 'bg-site-surface border border-site-border text-site-text hover:bg-site-surface-hover'
                }`}
              >
                {label}
                <ChipOverlay type={type} numbers={getOutsideBetNumbers(type)} />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="flex flex-col items-center gap-1 w-full">
          <span className="text-[10px] text-site-text-dim uppercase tracking-wider font-bold">History</span>
          <div className="flex gap-1 flex-wrap justify-center">
            {history.slice(-15).map((n, i) => {
              const color = getNumberColor(n);
              return (
                <span
                  key={`${n}-${i}`}
                  className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-[10px] font-bold text-white ${
                    color === 'red' ? 'bg-red-600'
                    : color === 'green' ? 'bg-emerald-600'
                    : 'bg-gray-800'
                  }`}
                >
                  {n}
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
                    <span className={`text-xs font-bold truncate max-w-15 ${isMe ? 'text-violet-400' : 'text-site-text'}`}>
                      {isMe ? 'You' : player.userName}
                    </span>
                  </div>
                  {player.totalBetThisRound > 0 && (
                    <div className="flex items-center gap-0.5">
                      <CoinIcon className="w-3 h-3" />
                      <span className="text-[10px] text-violet-400 font-bold">{player.totalBetThisRound}</span>
                    </div>
                  )}
                  {tablePhase === 'results' && myPayout && myPayout.netGain > 0 && (
                    <span className="text-[10px] text-emerald-400 font-bold animate-bounce">+{myPayout.payout}</span>
                  )}
                  {tablePhase === 'results' && myPayout && myPayout.netGain < 0 && (
                    <span className="text-[10px] text-red-400 font-bold">{myPayout.netGain}</span>
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
