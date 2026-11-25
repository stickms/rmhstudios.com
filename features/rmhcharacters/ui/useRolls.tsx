/**
 * The sheet's roll state: the mode, the last result and the log. One `useRolls` per open sheet; `RollsContext` hands it
 * to every `RollButton` so a line of the sheet stays a plain row with a button on its value.
 */
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RollBar } from './RollBar';
import { appendRoll, clearRollLog, readRollLog, type RollLogEntry } from '@features/rmhcharacters/engine/roll-log';
import {
  formatOutcome,
  rollD20,
  rollDamage,
  rollFree,
  type FreeRollError,
  type RollMode,
  type RollOutcome,
} from '@features/rmhcharacters/engine/rolls';

export interface LastRoll {
  /** Increments on every roll, so a repeated result is announced again. */
  seq: number;
  label: string;
  text: string;
  outcome: RollOutcome;
  /** Set on a 5e attack, so a critical can offer its damage. */
  attack?: { name: string; damage: string };
  /** The damage type, on a damage roll. */
  type?: string;
}

export interface RollsApi {
  system: '5e' | 'pf2e';
  mode: RollMode;
  setMode: (m: RollMode) => void;
  pinned: boolean;
  setPinned: (p: boolean) => void;
  /** PF2e: the DC the member typed, or empty. */
  dc: string;
  setDc: (v: string) => void;
  last: LastRoll | null;
  entries: RollLogEntry[];
  clear: () => void;
  /** A d20 test; `attack` marks a 5e attack roll and names its damage text. */
  d20: (label: string, bonus: number, attack?: { name: string; damage: string }) => void;
  damage: (label: string, text: string, critical: boolean) => void;
  /** The free roll box; `null` when it rolled, otherwise what was wrong. */
  free: (input: string) => FreeRollError | null;
}

export const RollsContext = createContext<RollsApi | null>(null);

export const useRollsContext = () => useContext(RollsContext);

export function useRolls(characterId: string, system: '5e' | 'pf2e', exhaustion: number): RollsApi {
  const { t } = useTranslation('character-rolls');
  const [mode, setMode] = useState<RollMode>('normal');
  const [pinned, setPinned] = useState(false);
  const [dc, setDc] = useState('');
  const [last, setLast] = useState<LastRoll | null>(null);
  const [entries, setEntries] = useState<RollLogEntry[]>([]);
  const [seq, setSeq] = useState(0);

  // Read after mount: the server and the first client render both show an empty log.
  useEffect(() => {
    setEntries(readRollLog(characterId));
  }, [characterId]);

  const record = useCallback(
    (label: string, outcome: RollOutcome, extra: Partial<LastRoll> = {}) => {
      const text = formatOutcome(outcome, { exhaustion: t('result.exhaustion', { defaultValue: 'exhaustion' }) });
      setEntries(appendRoll(characterId, { at: Date.now(), label, text, total: outcome.total }));
      setSeq((n) => n + 1);
      setLast({ seq: seq + 1, label, text, outcome, ...extra });
    },
    [characterId, seq, t],
  );

  const d20 = useCallback(
    (label: string, bonus: number, attack?: { name: string; damage: string }) => {
      const dcNum =
        system === 'pf2e' && dc.trim() !== '' && Number.isFinite(Number(dc)) ? Math.round(Number(dc)) : undefined;
      const outcome = rollD20({
        bonus,
        mode: system === '5e' ? mode : 'normal',
        exhaustion: system === '5e' ? exhaustion : 0,
        attack: system === '5e' && !!attack,
        ...(dcNum === undefined ? {} : { dc: dcNum }),
      });
      record(label, outcome, attack ? { attack } : {});
      if (system === '5e' && !pinned) setMode('normal');
    },
    [system, mode, exhaustion, dc, pinned, record],
  );

  const damage = useCallback(
    (label: string, text: string, critical: boolean) => {
      const out = rollDamage(text, system === 'pf2e' ? { doubleTotal: critical } : { critical });
      if (out) record(label, out, { type: out.type });
    },
    [record, system],
  );

  const free = useCallback(
    (input: string) => {
      const r = rollFree(input);
      if (!r.ok) return r.error;
      record(input.trim(), r.outcome);
      return null;
    },
    [record],
  );

  const clear = useCallback(() => {
    clearRollLog(characterId);
    setEntries([]);
  }, [characterId]);

  return { system, mode, setMode, pinned, setPinned, dc, setDc, last, entries, clear, d20, damage, free };
}

/** Provides the roll state to a sheet and draws the dice bar above it, so the sheet bodies stay untouched. */
export function RollsProvider({
  characterId,
  system,
  exhaustion,
  children,
}: {
  characterId: string;
  system: '5e' | 'pf2e';
  exhaustion: number;
  children: React.ReactNode;
}) {
  const rolls = useRolls(characterId, system, exhaustion);
  return (
    <RollsContext.Provider value={rolls}>
      <RollBar rolls={rolls} />
      {children}
    </RollsContext.Provider>
  );
}
