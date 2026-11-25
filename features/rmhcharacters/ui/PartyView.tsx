/**
 * One party: the summary table, the turn order and the controls for the game master and for a player.
 *
 * The summary is a table with header cells; the current turn is marked with words ("Current turn"), not only a colour.
 * The game master alone can open a player's full sheet, read-only, and only one the player shared (the sheet comes
 * from the server without `notes` or `portrait`; a refusal is the same "not available" line whatever the reason).
 */
import { useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Copy, Dices, Eye, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { usePrompt } from '@/components/ui/prompt-dialog';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useArrival } from '@/components/ui/arrive';
import { api } from '@/lib/contract/client';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/shared/app-toast';
import { SYSTEM_LABEL } from '@features/rmhcharacters/engine/data';
import {
  PARTY_EXTRA_NAME_MAX,
  PARTY_MAX_EXTRAS,
  PARTY_MAX_ORDER,
  PARTY_NAME_MAX,
  PARTY_ORDER_VALUE_MAX,
} from '@features/rmhcharacters/engine/party-limits';
import {
  deletePartyApi,
  leavePartyApi,
  removePartyMemberApi,
  renamePartyApi,
  rotatePartyCodeApi,
  setPartySharingApi,
  swapPartyCharacterApi,
  writePartyOrderApi,
  type PartyDetail,
  type PartyMemberView,
  type SharedSheet,
  type TurnLine,
  type WriteOrderBody,
} from '@features/rmhcharacters/engine/party.contract';
import { rollD20 } from '@features/rmhcharacters/engine/rolls';
import { useRoster } from '@features/rmhcharacters/engine/store';
import type { Dnd5eCharacter, GameSystem, Pf2eCharacter } from '@features/rmhcharacters/engine/types';
import { Sheet5e } from './dnd5e/Sheet5e';
import { SheetPf2e } from './pf2e/SheetPf2e';
import { TableRolls } from './TableRolls';
import { partyKey, partyListKey, useParty, usePartySheet } from './useParty';
import { useDnd5eData, usePf2eData } from './useData';

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/* -------------------------------------------------------------------------- */
/* The summary table                                                          */
/* -------------------------------------------------------------------------- */

export function SummaryTable({
  system,
  members,
  onOpenSheet,
  onRemove,
}: {
  system: GameSystem;
  members: PartyMemberView[];
  /** Game master only: opens the full sheet of a member who shared it. */
  onOpenSheet?: (userId: string) => void;
  /** Game master only. */
  onRemove?: (member: PartyMemberView) => void;
}) {
  const { t } = useTranslation('character-party');
  const actions = onOpenSheet !== undefined || onRemove !== undefined;
  const head = 'px-2 py-2 text-left text-xs font-medium text-app-text-muted';
  const cell = 'px-2 py-3 align-top text-sm text-app-text';
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] border-collapse">
        <caption className="sr-only">{t('table.caption', { defaultValue: 'Characters in this party' })}</caption>
        <thead>
          <tr className="border-b border-app-border">
            <th scope="col" className={head}>
              {t('table.character', { defaultValue: 'Character' })}
            </th>
            <th scope="col" className={head}>
              {t('table.ac', { defaultValue: 'AC' })}
            </th>
            <th scope="col" className={head}>
              {t('table.hp', { defaultValue: 'HP' })}
            </th>
            <th scope="col" className={head}>
              {t('table.conditions', { defaultValue: 'Conditions' })}
            </th>
            <th scope="col" className={head}>
              {system === 'dnd5e'
                ? t('table.passive', { defaultValue: 'Passive Perception' })
                : t('table.perception', { defaultValue: 'Perception' })}
            </th>
            <th scope="col" className={head}>
              {t('table.speed', { defaultValue: 'Speed' })}
            </th>
            <th scope="col" className={head}>
              {t('table.initiative', { defaultValue: 'Initiative' })}
            </th>
            {actions ? (
              <td className={head}>
                <span className="sr-only">{t('table.actions', { defaultValue: 'Actions' })}</span>
              </td>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {members.map((m) => {
            const s = m.summary;
            return (
              <tr key={m.userId} className="border-b border-app-border">
                <th scope="row" className={cn(cell, 'text-left font-normal')}>
                  <span className="block font-medium" dir="auto">
                    {s ? s.name || t('table.unnamed', { defaultValue: 'Unnamed character' }) : '—'}
                  </span>
                  <span className="block text-xs text-app-text-muted">
                    <bdi>{m.name}</bdi>
                    {m.isGm ? ` · ${t('table.gm', { defaultValue: 'game master' })}` : ''}
                  </span>
                  {s ? (
                    <span className="block text-xs text-app-text-muted">
                      {[s.ancestry, ...s.classes.map((k) => `${k.name} ${k.level}`)].filter(Boolean).join(' · ') ||
                        t('table.level', { defaultValue: 'Level {{n}}', n: s.level })}
                    </span>
                  ) : (
                    <span className="block text-xs text-app-text-muted">
                      {t('table.unavailable', { defaultValue: 'This character could not be read.' })}
                    </span>
                  )}
                </th>
                <td className={cn(cell, 'font-mono tabular-nums')}>{s ? s.ac : '—'}</td>
                <td className={cn(cell, 'font-mono tabular-nums')}>
                  {s ? `${s.hp.current} / ${s.hp.max}${s.hp.temp ? ` (+${s.hp.temp})` : ''}` : '—'}
                </td>
                <td className={cell}>{s && s.conditions.length ? s.conditions.join(', ') : '—'}</td>
                <td className={cn(cell, 'font-mono tabular-nums')}>
                  {s ? (system === 'dnd5e' ? s.perception : signed(s.perception)) : '—'}
                </td>
                <td className={cn(cell, 'font-mono tabular-nums')}>{s ? `${s.speed} ft` : '—'}</td>
                <td className={cn(cell, 'font-mono tabular-nums')}>{s ? signed(s.initiative) : '—'}</td>
                {actions ? (
                  <td className={cn(cell, 'whitespace-nowrap text-right')}>
                    {onOpenSheet && m.sheetShared ? (
                      <Button type="button" size="sm" onClick={() => onOpenSheet(m.userId)}>
                        <Eye aria-hidden /> {t('table.openSheet', { defaultValue: 'Open sheet' })}
                      </Button>
                    ) : onOpenSheet ? (
                      <span className="text-xs text-app-text-muted">
                        {t('table.notShared', { defaultValue: 'Sheet not shared' })}
                      </span>
                    ) : null}
                    {onRemove && !m.isGm ? (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={t('table.remove', { defaultValue: 'Remove {{name}}', name: m.name })}
                        onClick={() => onRemove(m)}
                      >
                        <X aria-hidden />
                      </Button>
                    ) : null}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The turn order                                                             */
/* -------------------------------------------------------------------------- */

/** What a player reads: the order, the current turn marked in words. */
export function TurnOrderList({ order, turnIndex }: { order: TurnLine[]; turnIndex: number }) {
  const { t } = useTranslation('character-party');
  if (order.length === 0)
    return <p className="text-sm text-app-text-muted">{t('turn.empty', { defaultValue: 'No turn order yet.' })}</p>;
  return (
    <ol className="flex flex-col">
      {order.map((line, i) => (
        <li
          key={line.id}
          aria-current={i === turnIndex ? 'step' : undefined}
          className="flex items-center gap-3 border-b border-app-border py-2 text-sm"
        >
          <span className="w-10 font-mono tabular-nums text-app-text-muted">{line.value}</span>
          <span className={cn('min-w-0 flex-1 truncate text-app-text', i === turnIndex && 'font-semibold')} dir="auto">
            {line.name}
          </span>
          {i === turnIndex ? (
            <span className="text-xs font-medium text-app-text">
              {t('turn.current', { defaultValue: 'Current turn' })}
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/** What the game master edits: a draft of the order, saved against the version it was read at (compare-and-set). */
function TurnOrderEditor({
  party,
  onSaved,
  onConflict,
}: {
  party: PartyDetail;
  onSaved: () => void;
  onConflict: () => void;
}) {
  const { t } = useTranslation('character-party');
  const refusalText = useRefusalText();
  const [draft, setDraft] = useState<TurnLine[]>(party.order);
  const [turn, setTurn] = useState(party.turnIndex);
  const [extra, setExtra] = useState('');
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(party.order) || turn !== party.turnIndex;
  const initiativeOf = (userId: string | null) =>
    party.members.find((m) => m.userId === userId)?.summary?.initiative ?? 0;
  const extras = draft.filter((l) => l.kind === 'extra').length;
  const missing = party.members.filter((m) => !draft.some((l) => l.userId === m.userId));

  const newId = () => Math.random().toString(36).slice(2, 12);
  const setValue = (id: string, value: number) =>
    setDraft((d) =>
      d.map((l) =>
        l.id === id ? { ...l, value: Math.max(-PARTY_ORDER_VALUE_MAX, Math.min(PARTY_ORDER_VALUE_MAX, value)) } : l,
      ),
    );

  async function send(body: WriteOrderBody) {
    if (busy) return;
    setBusy(true);
    try {
      await api(writePartyOrderApi, { params: { id: party.id }, body });
      onSaved();
    } catch (error) {
      toast.error(refusalText(error));
      onConflict();
    } finally {
      setBusy(false);
    }
  }

  const save = () =>
    send({
      op: 'set',
      version: party.orderVersion,
      initiative: draft.map((l) =>
        l.kind === 'member' && l.userId
          ? { id: l.id, kind: 'member' as const, userId: l.userId, value: l.value }
          : { id: l.id, kind: 'extra' as const, name: l.name, value: l.value },
      ),
      turnIndex: Math.min(turn, Math.max(0, draft.length - 1)),
    });

  const sort = () => {
    const current = draft[turn]?.id;
    const sorted = [...draft].sort((a, b) => b.value - a.value);
    setDraft(sorted);
    setTurn(
      Math.max(
        0,
        sorted.findIndex((l) => l.id === current),
      ),
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {draft.length === 0 ? (
        <p className="text-sm text-app-text-muted">{t('turn.empty', { defaultValue: 'No turn order yet.' })}</p>
      ) : (
        <ol className="flex flex-col">
          {draft.map((line, i) => (
            <li key={line.id} className="flex flex-wrap items-center gap-2 border-b border-app-border py-2 text-sm">
              <Input
                type="number"
                inputMode="numeric"
                className="w-20"
                value={line.value}
                min={-PARTY_ORDER_VALUE_MAX}
                max={PARTY_ORDER_VALUE_MAX}
                aria-label={t('turn.value', { defaultValue: 'Initiative for {{name}}', name: line.name })}
                onChange={(e) => setValue(line.id, Math.round(Number(e.target.value) || 0))}
              />
              <span className="min-w-0 flex-1 truncate text-app-text" dir="auto">
                {line.name}
              </span>
              {i === turn ? (
                <span className="text-xs font-medium text-app-text">
                  {t('turn.current', { defaultValue: 'Current turn' })}
                </span>
              ) : (
                <Button type="button" size="xs" variant="ghost" onClick={() => setTurn(i)}>
                  {t('turn.makeCurrent', { defaultValue: 'Make current' })}
                </Button>
              )}
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={t('turn.roll', { defaultValue: 'Roll initiative for {{name}}', name: line.name })}
                onClick={() =>
                  setValue(line.id, rollD20({ bonus: line.kind === 'member' ? initiativeOf(line.userId) : 0 }).total)
                }
              >
                <Dices aria-hidden />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={t('turn.removeLine', { defaultValue: 'Remove {{name}} from the order', name: line.name })}
                onClick={() => {
                  setDraft((d) => d.filter((l) => l.id !== line.id));
                  setTurn((c) => (i < c ? c - 1 : c));
                }}
              >
                <X aria-hidden />
              </Button>
            </li>
          ))}
        </ol>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {missing.length ? (
          <Button
            type="button"
            onClick={() =>
              setDraft((d) => [
                ...d,
                ...missing.map((m) => ({
                  id: newId(),
                  kind: 'member' as const,
                  userId: m.userId,
                  name: m.summary?.name || m.name,
                  value: 0,
                })),
              ])
            }
          >
            <Plus aria-hidden /> {t('turn.addParty', { defaultValue: 'Add the party' })}
          </Button>
        ) : null}
        <Input
          className="w-48"
          value={extra}
          maxLength={PARTY_EXTRA_NAME_MAX}
          dir="auto"
          aria-label={t('turn.extraName', { defaultValue: 'Name of an extra, for example Goblin 1' })}
          placeholder={t('turn.extraPlaceholder', { defaultValue: 'Goblin 1' })}
          onChange={(e) => setExtra(e.target.value)}
        />
        <Button
          type="button"
          disabled={!extra.trim() || extras >= PARTY_MAX_EXTRAS || draft.length >= PARTY_MAX_ORDER}
          onClick={() => {
            setDraft((d) => [...d, { id: newId(), kind: 'extra', userId: null, name: extra.trim(), value: 0 }]);
            setExtra('');
          }}
        >
          <Plus aria-hidden /> {t('turn.addExtra', { defaultValue: 'Add an extra' })}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={sort} disabled={draft.length < 2}>
          {t('turn.sort', { defaultValue: 'Sort high to low' })}
        </Button>
        <Button type="button" variant="primary" onClick={() => void save()} disabled={!dirty || busy}>
          {t('turn.save', { defaultValue: 'Save order' })}
        </Button>
        <Button
          type="button"
          disabled={dirty || busy || draft.length < 2}
          onClick={() => void send({ op: 'advance', version: party.orderVersion })}
        >
          <ArrowRight aria-hidden /> {t('turn.next', { defaultValue: 'Next turn' })}
        </Button>
      </div>
      {dirty ? (
        <p role="status" className="text-xs text-app-text-muted">
          {t('turn.unsaved', { defaultValue: 'Save the order before moving to the next turn.' })}
        </p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* A shared sheet, read-only                                                  */
/* -------------------------------------------------------------------------- */

const noop = () => {};

/** A shared sheet in the existing sheet components with `readOnly`. `notes` is never sent, so it is blank here. */
export function ReadOnlySheet({ sheet }: { sheet: SharedSheet }) {
  const d5 = useDnd5eData(sheet.system === 'dnd5e');
  const pf = usePf2eData(sheet.system === 'pf2e');
  if (sheet.system === 'dnd5e') {
    const c: Dnd5eCharacter = { ...sheet, notes: '' };
    return d5 ? <Sheet5e c={c} d={d5} set={noop} readOnly /> : <SheetLoading />;
  }
  const c: Pf2eCharacter = { ...sheet, notes: '' };
  return pf ? <SheetPf2e c={c} d={pf} set={noop} readOnly /> : <SheetLoading />;
}

function SheetLoading() {
  const { t } = useTranslation('character-party');
  return (
    <p className="py-4 text-sm text-app-text-muted">{t('sheet.loading', { defaultValue: 'Opening the sheet…' })}</p>
  );
}

function SharedSheetPanel({
  partyId,
  userId,
  name,
  onClose,
}: {
  partyId: string;
  userId: string;
  name: string;
  onClose: () => void;
}) {
  const { t } = useTranslation('character-party');
  const q = usePartySheet(partyId, userId);
  return (
    <section aria-labelledby="party-sheet-title" className="flex flex-col gap-3 border-t border-app-border pt-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="party-sheet-title" className="text-lg font-semibold text-app-text">
          {t('sheet.title', { defaultValue: 'Sheet of {{name}} (read only)', name })}
        </h2>
        <Button type="button" variant="ghost" onClick={onClose}>
          <X aria-hidden /> {t('sheet.close', { defaultValue: 'Close' })}
        </Button>
      </div>
      {q.isPending ? (
        <SheetLoading />
      ) : q.isError ? (
        <p role="alert" className="text-sm text-app-text">
          {t('sheet.unavailable', {
            defaultValue: 'This sheet is not available. The player may have stopped sharing it or left the party.',
          })}
        </p>
      ) : (
        <>
          <p className="text-xs text-app-text-muted">
            {t('sheet.note', { defaultValue: 'Private notes and the portrait are never shared.' })}
          </p>
          <ReadOnlySheet sheet={q.data.character} />
        </>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* The page                                                                   */
/* -------------------------------------------------------------------------- */

export function PartyView({
  id,
  onBack,
  onBring,
  onOpenSheet,
}: {
  id: string;
  onBack: () => void;
  /** The game master brings a character of their own: opens the join screen with the party's code. */
  onBring: (code: string) => void;
  /** A player opens their own sheet from the table's log, with "Roll for the table" available. */
  onOpenSheet?: (characterId: string) => void;
}) {
  const { t } = useTranslation('character-party');
  const q = useParty(id);
  const arrive = useArrival(q.isSuccess);

  const back = (
    <Button type="button" variant="ghost" onClick={onBack}>
      <ArrowLeft aria-hidden /> {t('view.back', { defaultValue: 'Parties' })}
    </Button>
  );

  if (q.isPending)
    return (
      <div
        className="flex flex-col gap-4"
        role="status"
        aria-label={t('view.loading', { defaultValue: 'Loading the party…' })}
      >
        <div>{back}</div>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  if (q.isError)
    return (
      <div className="flex flex-col items-start gap-3">
        {back}
        <p role="alert" className="text-sm text-app-text">
          {t('view.unavailable', {
            defaultValue: 'This party is not available. You may have left it, or it was deleted.',
          })}
        </p>
        <Button type="button" onClick={() => void q.refetch()}>
          {t('view.retry', { defaultValue: 'Try again' })}
        </Button>
      </div>
    );
  return (
    <div className={cn('flex flex-col gap-6', arrive)}>
      <div>{back}</div>
      <PartyBody party={q.data.party} onBack={onBack} onBring={onBring} {...(onOpenSheet ? { onOpenSheet } : {})} />
    </div>
  );
}

function Row({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-b border-app-border pb-5">
      <h2 className="text-lg font-semibold text-app-text">{title}</h2>
      {hint ? <p className="max-w-2xl text-sm text-app-text-muted">{hint}</p> : null}
      {children}
    </section>
  );
}

function PartyBody({
  party,
  onBack,
  onBring,
  onOpenSheet,
}: {
  party: PartyDetail;
  onBack: () => void;
  onBring: (code: string) => void;
  onOpenSheet?: (characterId: string) => void;
}) {
  const { t } = useTranslation('character-party');
  const refusalText = useRefusalText();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const [openSheet, setOpenSheet] = useState<string | null>(null);
  const isGm = party.role === 'gm';
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: partyKey(party.id) });
    void queryClient.invalidateQueries({ queryKey: partyListKey });
  };
  const run = async (fn: () => Promise<unknown>, done?: () => void) => {
    try {
      await fn();
      done?.();
      refresh();
    } catch (error) {
      toast.error(refusalText(error));
      refresh();
    }
  };
  const link =
    isGm && party.inviteCode && typeof location !== 'undefined'
      ? `${location.origin}/rmhcharacters?party=${party.inviteCode}`
      : '';
  const sheetOwner = party.members.find((m) => m.userId === openSheet);

  return (
    <>
      <header className="flex flex-col gap-1 border-b border-app-border pb-4">
        <h1 className="text-2xl font-semibold text-app-text" dir="auto">
          {party.name}
        </h1>
        <p className="text-sm text-app-text-muted">
          {SYSTEM_LABEL[party.system]} · {t('view.gm', { defaultValue: 'Game master' })}: <bdi>{party.gm}</bdi>
        </p>
      </header>

      <Row title={t('view.summary', { defaultValue: 'The party' })}>
        {party.members.length === 0 ? (
          <p className="text-sm text-app-text-muted">
            {t('view.noMembers', {
              defaultValue: 'No one has brought a character yet. Send the invite link to your players.',
            })}
          </p>
        ) : (
          <SummaryTable
            system={party.system}
            members={party.members}
            {...(isGm
              ? {
                  onOpenSheet: setOpenSheet,
                  onRemove: async (m: PartyMemberView) => {
                    const ok = await confirm({
                      title: t('view.removeTitle', { defaultValue: 'Remove this player?' }),
                      description: t('view.removeBody', {
                        defaultValue: '{{name}} leaves the party and you can no longer open their sheet.',
                        name: m.name,
                      }),
                      confirmLabel: t('view.removeConfirm', { defaultValue: 'Remove' }),
                      danger: true,
                    });
                    if (ok)
                      await run(
                        () => api(removePartyMemberApi, { params: { id: party.id, userId: m.userId } }),
                        () => setOpenSheet((c) => (c === m.userId ? null : c)),
                      );
                  },
                }
              : {})}
          />
        )}
        {isGm && !party.members.some((m) => m.isGm) && party.inviteCode ? (
          <div>
            <Button type="button" onClick={() => onBring(party.inviteCode ?? '')}>
              <Plus aria-hidden /> {t('view.bring', { defaultValue: 'Bring my own character' })}
            </Button>
          </div>
        ) : null}
      </Row>

      {openSheet && sheetOwner ? (
        <SharedSheetPanel
          partyId={party.id}
          userId={openSheet}
          name={sheetOwner.summary?.name || sheetOwner.name}
          onClose={() => setOpenSheet(null)}
        />
      ) : null}

      <TableRolls
        partyId={party.id}
        system={party.system}
        role={party.role}
        {...(onOpenSheet ? { onOpenSheet } : {})}
      />

      <Row
        title={t('turn.title', { defaultValue: 'Turn order' })}
        {...(isGm
          ? { hint: t('turn.hint', { defaultValue: 'Players read this and see changes within about twenty seconds.' }) }
          : {})}
      >
        {isGm ? (
          <TurnOrderEditor key={party.orderVersion} party={party} onSaved={refresh} onConflict={refresh} />
        ) : (
          <TurnOrderList order={party.order} turnIndex={party.turnIndex} />
        )}
      </Row>

      {isGm ? (
        <Row
          title={t('invite.title', { defaultValue: 'Invite players' })}
          hint={t('invite.hint', {
            defaultValue:
              'Anyone with this link can join with a character of the same game. Change the code to stop old links working.',
          })}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Input
              readOnly
              value={link}
              className="min-w-0 flex-1"
              aria-label={t('invite.link', { defaultValue: 'Invite link' })}
            />
            <Button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(link).then(
                  () => toast.success(t('invite.copied', { defaultValue: 'Link copied.' })),
                  () =>
                    toast.error(
                      t('invite.copyFailed', {
                        defaultValue: 'The link could not be copied. Select it and copy it by hand.',
                      }),
                    ),
                );
              }}
            >
              <Copy aria-hidden /> {t('invite.copy', { defaultValue: 'Copy link' })}
            </Button>
            <Button
              type="button"
              onClick={async () => {
                const ok = await confirm({
                  title: t('invite.rotateTitle', { defaultValue: 'Change the invite code?' }),
                  description: t('invite.rotateBody', { defaultValue: 'Links you already sent stop working.' }),
                  confirmLabel: t('invite.rotateConfirm', { defaultValue: 'Change code' }),
                });
                if (ok) await run(() => api(rotatePartyCodeApi, { params: { id: party.id } }));
              }}
            >
              <RefreshCw aria-hidden /> {t('invite.rotate', { defaultValue: 'Change code' })}
            </Button>
          </div>
        </Row>
      ) : (
        <PlayerControls party={party} onLeft={onBack} />
      )}

      {isGm ? (
        <Row title={t('manage.title', { defaultValue: 'Manage' })}>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={async () => {
                const name = await prompt({
                  title: t('manage.renameTitle', { defaultValue: 'Rename the party' }),
                  initialValue: party.name,
                  validate: (v: string) =>
                    v.trim().length > PARTY_NAME_MAX
                      ? t('manage.nameTooLong', {
                          defaultValue: 'Use at most {{max}} characters.',
                          max: PARTY_NAME_MAX,
                        })
                      : null,
                });
                const trimmed = name?.trim();
                if (trimmed)
                  await run(() => api(renamePartyApi, { params: { id: party.id }, body: { name: trimmed } }));
              }}
            >
              {t('manage.rename', { defaultValue: 'Rename' })}
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={async () => {
                const ok = await confirm({
                  title: t('manage.deleteTitle', { defaultValue: 'Delete this party?' }),
                  description: t('manage.deleteBody', {
                    defaultValue: 'The party and its turn order are removed. Your players keep their characters.',
                  }),
                  confirmLabel: t('manage.deleteConfirm', { defaultValue: 'Delete party' }),
                  danger: true,
                });
                if (ok) await run(() => api(deletePartyApi, { params: { id: party.id } }), onBack);
              }}
            >
              <Trash2 aria-hidden /> {t('manage.delete', { defaultValue: 'Delete party' })}
            </Button>
          </div>
        </Row>
      ) : null}
    </>
  );
}

/** A player's own controls: what the game master may open, swapping the character, leaving. */
function PlayerControls({ party, onLeft }: { party: PartyDetail; onLeft: () => void }) {
  const { t } = useTranslation('character-party');
  const refusalText = useRefusalText();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const roster = useRoster((s) => s.characters);
  const own = roster.filter((c) => c.system === party.system);
  const [pick, setPick] = useState('');
  const sharing = party.members.some((m) => m.sheetShared);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: partyKey(party.id) });
    void queryClient.invalidateQueries({ queryKey: partyListKey });
  };

  return (
    <Row title={t('player.title', { defaultValue: 'Your character in this party' })}>
      <div className="flex items-start gap-3">
        <Switch
          checked={sharing}
          aria-label={t('player.share', { defaultValue: 'Let the game master open my full sheet' })}
          aria-describedby="party-share-hint"
          onCheckedChange={(on) => {
            void api(setPartySharingApi, { params: { id: party.id }, body: { sheetShared: on } }).then(
              refresh,
              (e: unknown) => {
                toast.error(refusalText(e));
                refresh();
              },
            );
          }}
        />
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-app-text">
            {t('player.share', { defaultValue: 'Let the game master open my full sheet' })}
          </span>
          <span id="party-share-hint" className="max-w-xl text-sm text-app-text-muted">
            {t('player.shareHint', {
              defaultValue:
                'Off by default. Only the game master can open it, read only, and never your notes or portrait. Turn it off any time.',
            })}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-app-text-muted">
            {t('player.swap', { defaultValue: 'Bring a different character' })}
          </span>
          <Select
            tier="app"
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            aria-label={t('player.swap', { defaultValue: 'Bring a different character' })}
          >
            <option value="">{t('player.choose', { defaultValue: 'Choose a character' })}</option>
            {own.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name || t('player.unnamed', { defaultValue: 'Unnamed character' })}
              </option>
            ))}
          </Select>
        </label>
        <Button
          type="button"
          disabled={!pick}
          onClick={() => {
            void api(swapPartyCharacterApi, { params: { id: party.id }, body: { characterId: pick } }).then(
              () => {
                setPick('');
                refresh();
              },
              (e: unknown) => toast.error(refusalText(e)),
            );
          }}
        >
          {t('player.swapConfirm', { defaultValue: 'Swap' })}
        </Button>
        <Button
          type="button"
          variant="danger"
          onClick={async () => {
            const ok = await confirm({
              title: t('player.leaveTitle', { defaultValue: 'Leave this party?' }),
              description: t('player.leaveBody', {
                defaultValue: 'The party stops seeing your character and the game master loses access to your sheet.',
              }),
              confirmLabel: t('player.leaveConfirm', { defaultValue: 'Leave party' }),
              danger: true,
            });
            if (!ok) return;
            void api(leavePartyApi, { params: { id: party.id } }).then(
              () => {
                refresh();
                onLeft();
              },
              (e: unknown) => toast.error(refusalText(e)),
            );
          }}
        >
          {t('player.leave', { defaultValue: 'Leave party' })}
        </Button>
      </div>
    </Row>
  );
}
