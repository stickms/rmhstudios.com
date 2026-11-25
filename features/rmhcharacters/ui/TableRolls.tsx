/**
 * The table's roll log: what each member rolled for the table, newest first, from the server's own dice.
 *
 * Names are the character's current name, joined at read time (`who`): a roll whose character left the party reads
 * "A character who left", and the game master's reads "Game master". A name is member text, so it sits in `<bdi>`.
 * New rows from the poll fade in (M9) and are read once by a polite live region. The game master, who has no sheet
 * to roll from, rolls free notation here, for the table or in secret.
 */
import { useState } from 'react';
import { Dices } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrivingKeys } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';
import { parseDice } from '@/lib/toolbox/dice';
import { DND5E_SKILLS } from '@features/rmhcharacters/engine/dnd5e/skills';
import { parseLabel, type PartyRoll, type RollVisibility } from '@features/rmhcharacters/engine/party-rolls';
import type { PartyRollList } from '@features/rmhcharacters/engine/party-rolls.contract';
import { withinSheetLimits } from '@features/rmhcharacters/engine/rolls';
import { ABILITY_NAMES, type Ability, type GameSystem } from '@features/rmhcharacters/engine/types';
import { readEarlierRolls, usePartyRolls, useRollForTable } from './usePartyRolls';

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const capitalise = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

/** The sentence's "what", from the rules key a roll is stored under. */
function useWhat() {
  const { t } = useTranslation('party-rolls');
  return (roll: PartyRoll): string => {
    const parsed = parseLabel(roll.label);
    switch (roll.kind) {
      case 'skill':
        return roll.label === 'lore'
          ? t('what.lore', { defaultValue: 'Lore' })
          : (DND5E_SKILLS.find((s) => s.id === roll.label)?.name ?? capitalise(roll.label));
      case 'check':
        return t('what.check', {
          defaultValue: '{{name}} check',
          name: ABILITY_NAMES[roll.label as Ability] ?? capitalise(roll.label),
        });
      case 'save':
        return t('what.save', {
          defaultValue: '{{name}} save',
          name: ABILITY_NAMES[roll.label as Ability] ?? capitalise(roll.label),
        });
      case 'initiative':
        return t('what.initiative', { defaultValue: 'Initiative' });
      case 'perception':
        return t('what.perception', { defaultValue: 'Perception' });
      case 'attack':
        return t('what.attack', { defaultValue: 'Attack' });
      case 'damage':
        return parsed?.critical
          ? t('what.criticalDamage', { defaultValue: 'Critical damage' })
          : t('what.damage', { defaultValue: 'Damage' });
      case 'strike':
        return t('what.strike', { defaultValue: 'Strike, attack {{n}}', n: (parsed?.map ?? 0) + 1 });
      case 'free':
        return roll.notation;
    }
  };
}

function useDegree() {
  const { t } = useTranslation('party-rolls');
  return (d: NonNullable<PartyRoll['degree']>): string => {
    switch (d) {
      case 'critical-success':
        return t('degree.criticalSuccess', { defaultValue: 'Critical success' });
      case 'success':
        return t('degree.success', { defaultValue: 'Success' });
      case 'failure':
        return t('degree.failure', { defaultValue: 'Failure' });
      case 'critical-failure':
        return t('degree.criticalFailure', { defaultValue: 'Critical failure' });
    }
  };
}

/** The roller's name as plain text, for the live region ("Ada"), and as the markup of a row. */
function useWho() {
  const { t } = useTranslation('party-rolls');
  return (who: PartyRoll['who']): { text: string; member: boolean } => {
    if (who.kind === 'gm') return { text: t('who.gm', { defaultValue: 'Game master' }), member: false };
    if (who.kind === 'hidden') return { text: t('who.hidden', { defaultValue: 'A player' }), member: false };
    if (who.kind === 'left') return { text: t('who.left', { defaultValue: 'A character who left' }), member: false };
    return { text: who.name || t('who.unnamed', { defaultValue: 'Unnamed character' }), member: true };
  };
}

export function TableRollRow({ roll, arriving }: { roll: PartyRoll; arriving?: boolean }) {
  const { t } = useTranslation('party-rolls');
  const what = useWhat();
  const degree = useDegree();
  const who = useWho();
  const w = who(roll.who);
  return (
    <li className={cn('flex flex-col gap-1 border-b border-app-border py-2', arriving && 'arrive')}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-sm text-app-text">
          {w.member ? <bdi className="font-medium">{w.text}</bdi> : <span className="font-medium">{w.text}</span>}{' '}
          <span className="text-app-text-muted">{t('row.rolled', { defaultValue: 'rolled' })}</span>{' '}
          <bdi>{what(roll)}</bdi>
        </span>
        <span className="font-mono text-lg tabular-nums text-app-text">{roll.total}</span>
        {roll.degree ? <span className="text-sm font-medium text-app-text">{degree(roll.degree)}</span> : null}
        {roll.visibility === 'gm' ? (
          <span className="text-xs text-app-text-muted">{t('row.gmOnly', { defaultValue: 'Game master only' })}</span>
        ) : null}
        {roll.visibility === 'secret' ? (
          <span className="text-xs text-app-text-muted">{t('row.secret', { defaultValue: 'Secret' })}</span>
        ) : null}
        {roll.mode === 'advantage' ? (
          <span className="text-xs text-app-text-muted">{t('row.advantage', { defaultValue: 'Advantage' })}</span>
        ) : null}
        {roll.mode === 'disadvantage' ? (
          <span className="text-xs text-app-text-muted">{t('row.disadvantage', { defaultValue: 'Disadvantage' })}</span>
        ) : null}
        {roll.dc !== null ? (
          <span className="text-xs text-app-text-muted">{t('row.dc', { defaultValue: 'DC {{dc}}', dc: roll.dc })}</span>
        ) : null}
      </div>
      <span className="font-mono text-xs tabular-nums text-app-text-muted">
        {roll.notation} ({roll.dice.join(', ')}){roll.modifier !== 0 ? ` ${signed(roll.modifier)}` : ''}
      </span>
    </li>
  );
}

/** The log as a list: rows only, the states around it belong to the container. */
export function TableRollsList({ rolls, arriving }: { rolls: PartyRoll[]; arriving?: (id: string) => boolean }) {
  return (
    <ul>
      {rolls.map((r) => (
        <TableRollRow key={r.id} roll={r} arriving={arriving?.(r.id) ?? false} />
      ))}
    </ul>
  );
}

/** The sentence a screen reader hears for one new roll: "Ada rolled Stealth: 17". */
export function useAnnouncement() {
  const { t } = useTranslation('party-rolls');
  const what = useWhat();
  const who = useWho();
  return (roll: PartyRoll) =>
    t('live.rolled', {
      defaultValue: '{{who}} rolled {{what}}: {{total}}',
      who: who(roll.who).text,
      what: what(roll),
      total: roll.total,
    });
}

export function TableRolls({
  partyId,
  system,
  role,
  onOpenSheet,
}: {
  partyId: string;
  system: GameSystem;
  role: 'gm' | 'player';
  /** A player opens their own sheet with the table switch available (the app navigates). */
  onOpenSheet?: (characterId: string) => void;
}) {
  const { t } = useTranslation('party-rolls');
  const q = usePartyRolls(partyId);
  const announce = useAnnouncement();
  const [older, setOlder] = useState<PartyRoll[]>([]);
  const [olderNext, setOlderNext] = useState<string | null | undefined>(undefined);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [earlierFailed, setEarlierFailed] = useState(false);
  const [said, setSaid] = useState('');
  const [seenId, setSeenId] = useState<string | null>(null);

  const newest: PartyRoll[] = q.data?.rolls ?? [];
  const known = new Set(newest.map((r) => r.id));
  const rows = [...newest, ...older.filter((r) => !known.has(r.id))];
  const arriving = useArrivingKeys(rows.map((r) => r.id));
  const next = olderNext === undefined ? (q.data?.next ?? null) : olderNext;

  // Read each roll that arrives after the first load once, in a polite live region; a roll of mine is already on
  // screen. State adjusted while rendering (as `useArrival` does), so no effect and no dependency list is needed.
  const top = newest[0];
  if (top && top.id !== seenId) {
    setSeenId(top.id);
    if (seenId !== null && !top.mine) setSaid(announce(top));
  }

  const showEarlier = async () => {
    if (!next) return;
    setLoadingOlder(true);
    setEarlierFailed(false);
    try {
      const page: PartyRollList = await readEarlierRolls(partyId, next);
      setOlder((o) => [...o, ...page.rolls.filter((r) => !o.some((x) => x.id === r.id))]);
      setOlderNext(page.next);
    } catch {
      setEarlierFailed(true);
    } finally {
      setLoadingOlder(false);
    }
  };

  const mine = q.data?.mine.characterId ?? null;

  return (
    <section aria-labelledby="table-rolls-title" className="flex flex-col gap-2 border-b border-app-border pb-5">
      <h2 id="table-rolls-title" className="text-lg font-semibold text-app-text">
        {t('title', { defaultValue: 'Table rolls' })}
      </h2>
      <p className="max-w-2xl text-sm text-app-text-muted">
        {role === 'gm'
          ? t('hint.gm', {
              defaultValue:
                'Rolls the table makes appear here within a few seconds. Roll here for the table or in secret; players see only what is for the table.',
            })
          : t('hint.player', {
              defaultValue:
                'Open your sheet from here and turn on "Roll for the table". The site rolls from your sheet, so the game master can trust the number.',
            })}
      </p>
      <p role="status" aria-live="polite" className="sr-only">
        {said}
      </p>

      {role === 'gm' ? <GmRoller partyId={partyId} system={system} /> : null}
      {role === 'player' && mine && onOpenSheet ? (
        <div>
          <Button type="button" onClick={() => onOpenSheet(mine)}>
            <Dices aria-hidden /> {t('open', { defaultValue: 'Open my sheet to roll' })}
          </Button>
        </div>
      ) : null}

      {q.isPending ? (
        <div
          role="status"
          aria-label={t('loading', { defaultValue: 'Loading the rolls…' })}
          className="flex flex-col gap-2"
        >
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : q.isError ? (
        <div className="flex flex-col items-start gap-2">
          <p role="alert" className="text-sm text-app-text">
            {t('error', { defaultValue: 'The rolls could not be loaded.' })}
          </p>
          <Button type="button" onClick={() => void q.refetch()}>
            {t('retry', { defaultValue: 'Try again' })}
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-app-text-muted">{t('empty', { defaultValue: 'No rolls yet.' })}</p>
      ) : (
        <TableRollsList rolls={rows} arriving={arriving} />
      )}

      {next ? (
        <div className="flex items-center gap-3">
          <Button type="button" onClick={() => void showEarlier()} disabled={loadingOlder}>
            {t('earlier', { defaultValue: 'Show earlier' })}
          </Button>
          {earlierFailed ? (
            <span role="alert" className="text-sm text-app-text">
              {t('earlierFailed', { defaultValue: 'Earlier rolls could not be loaded.' })}
            </span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** The game master's roller: free notation, for the table or secret, with a DC on a secret Pathfinder roll. */
function GmRoller({ partyId, system }: { partyId: string; system: GameSystem }) {
  const { t } = useTranslation('party-rolls');
  const [notation, setNotation] = useState('');
  const [visibility, setVisibility] = useState<Extract<RollVisibility, 'table' | 'secret'>>('table');
  const [dc, setDc] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState('');
  const announce = useAnnouncement();
  const roll = useRollForTable(partyId, (r) => setResult(announce(r)));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseDice(notation);
    if (!parsed.ok || withinSheetLimits(parsed.terms)) {
      setProblem(
        t('invalid', {
          defaultValue: 'That is not dice notation. Use forms like d20, 3d6+2 or 4d6kh3, up to 50 dice.',
        }),
      );
      return;
    }
    setProblem(null);
    const dcNum = dc.trim() !== '' && Number.isFinite(Number(dc)) ? Math.round(Number(dc)) : undefined;
    roll.mutate({
      roll: { kind: 'free', notation: notation.trim() },
      mode: 'normal',
      visibility,
      ...(visibility === 'secret' && system === 'pf2e' && dcNum !== undefined
        ? { dc: Math.min(60, Math.max(0, dcNum)) }
        : {}),
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-app-text-muted">{t('gm.notation', { defaultValue: 'Dice' })}</span>
        <Input
          value={notation}
          onChange={(e) => setNotation(e.target.value)}
          placeholder="1d20+5"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? 'table-roll-problem' : undefined}
          className="w-40 font-mono"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-app-text-muted">{t('gm.visibility', { defaultValue: 'Who sees it' })}</span>
        <Select value={visibility} onChange={(e) => setVisibility(e.target.value === 'secret' ? 'secret' : 'table')}>
          <option value="table">{t('visibility.table', { defaultValue: 'The table' })}</option>
          <option value="secret">{t('visibility.secret', { defaultValue: 'Only me' })}</option>
        </Select>
      </label>
      {visibility === 'secret' && system === 'pf2e' ? (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-app-text-muted">{t('gm.dc', { defaultValue: 'DC' })}</span>
          <Input
            type="number"
            inputMode="numeric"
            value={dc}
            onChange={(e) => setDc(e.target.value)}
            placeholder={t('gm.dcPlaceholder', { defaultValue: 'Optional' })}
            className="w-24"
          />
        </label>
      ) : null}
      <Button type="submit" disabled={roll.isPending}>
        {t('gm.roll', { defaultValue: 'Roll' })}
      </Button>
      {problem ? (
        <p id="table-roll-problem" role="alert" className="basis-full text-sm text-app-danger">
          {problem}
        </p>
      ) : null}
      <p role="status" aria-live="polite" className="basis-full text-sm text-app-text-muted empty:hidden">
        {result}
      </p>
    </form>
  );
}
