/**
 * The sheet's roll state: the mode, the last result and the log. One `useRolls` per open sheet; `RollsContext` hands it
 * to every `RollButton` so a line of the sheet stays a plain row with a button on its value.
 */
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RollBar } from './RollBar';
import type { PartyRoll, RollVisibility, SheetRequest } from '@features/rmhcharacters/engine/party-rolls';
import type { GameSystem } from '@features/rmhcharacters/engine/types';
import { useRollForTable } from './usePartyRolls';
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

/** The party a sheet was opened from: the table switch exists only while one is given. */
export interface PartyRollContext {
  id: string;
  role: 'gm' | 'player';
  system: GameSystem;
}

/** "Roll for the table": off by default each time a sheet opens. */
export interface TableApi {
  role: 'gm' | 'player';
  on: boolean;
  setOn: (on: boolean) => void;
  visibility: Extract<RollVisibility, 'table' | 'gm' | 'secret'>;
  setVisibility: (v: Extract<RollVisibility, 'table' | 'gm' | 'secret'>) => void;
  pending: boolean;
  /** The newest roll the server made for this sheet, so a critical hit can offer its damage. */
  last: PartyRoll | null;
  /** Ask the server to roll `req` for the table; it reads the character and computes the modifier itself. */
  send: (req: SheetRequest) => void;
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
  /**
   * One Hit Die (`1d8+2`) for a short rest, logged under `label`. Rolled for the table while "Roll for the table" is on,
   * so it shows in the party's rolls. The total, or `null` when it could not be rolled.
   */
  hitDie: (label: string, notation: string) => Promise<number | null>;
  /** Present only while the sheet is opened from a party. */
  table?: TableApi;
}

export const RollsContext = createContext<RollsApi | null>(null);

export const useRollsContext = () => useContext(RollsContext);

export function useRolls(
  characterId: string,
  system: '5e' | 'pf2e',
  exhaustion: number,
  party?: PartyRollContext,
): RollsApi {
  const { t } = useTranslation('character-rolls');
  const [mode, setMode] = useState<RollMode>('normal');
  const [pinned, setPinned] = useState(false);
  const [dc, setDc] = useState('');
  const [last, setLast] = useState<LastRoll | null>(null);
  const [entries, setEntries] = useState<RollLogEntry[]>([]);
  const [seq, setSeq] = useState(0);
  const [tableOn, setTableOn] = useState(false);
  const [visibility, setVisibility] = useState<TableApi['visibility']>('table');
  const [tableLast, setTableLast] = useState<PartyRoll | null>(null);
  const sendRoll = useRollForTable(party?.id ?? '', setTableLast);

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

  const hitDie = useCallback(
    async (label: string, notation: string) => {
      if (tableOn && party) {
        try {
          const rolled = await sendRoll.mutateAsync({
            roll: { kind: 'free', notation, as: 'hitDie' },
            mode: 'normal',
            visibility,
          });
          return rolled.total;
        } catch {
          return null;
        }
      }
      const r = rollFree(notation);
      if (!r.ok) return null;
      record(label, r.outcome);
      return r.outcome.total;
    },
    [tableOn, party, sendRoll, visibility, record],
  );

  const clear = useCallback(() => {
    clearRollLog(characterId);
    setEntries([]);
  }, [characterId]);

  const send = useCallback(
    (req: SheetRequest) => {
      if (!party) return;
      const dcNum = dc.trim() !== '' && Number.isFinite(Number(dc)) ? Math.round(Number(dc)) : undefined;
      sendRoll.mutate({
        roll: req,
        mode: system === '5e' ? mode : 'normal',
        visibility,
        // Only the game master's secret Pathfinder roll carries a DC; the server refuses one from a player.
        ...(party.role === 'gm' && visibility === 'secret' && system === 'pf2e' && dcNum !== undefined
          ? { dc: Math.min(60, Math.max(0, dcNum)) }
          : {}),
      });
      if (system === '5e' && !pinned) setMode('normal');
    },
    [party, dc, sendRoll, system, mode, visibility, pinned],
  );

  const table: TableApi | undefined = party
    ? {
        role: party.role,
        on: tableOn,
        setOn: setTableOn,
        visibility,
        setVisibility,
        pending: sendRoll.isPending,
        last: tableLast,
        send,
      }
    : undefined;

  return {
    system,
    mode,
    setMode,
    pinned,
    setPinned,
    dc,
    setDc,
    last,
    entries,
    clear,
    d20,
    damage,
    free,
    hitDie,
    ...(table ? { table } : {}),
  };
}

/** Provides the roll state to a sheet and draws the dice bar above it, so the sheet bodies stay untouched. */
export function RollsProvider({
  characterId,
  system,
  exhaustion,
  party,
  children,
}: {
  characterId: string;
  system: '5e' | 'pf2e';
  exhaustion: number;
  /** Set when the sheet was opened from a party: the "Roll for the table" switch appears. */
  party?: PartyRollContext;
  children: React.ReactNode;
}) {
  const rolls = useRolls(characterId, system, exhaustion, party);
  return (
    <RollsContext.Provider value={rolls}>
      <RollBar rolls={rolls} />
      {children}
    </RollsContext.Provider>
  );
}
