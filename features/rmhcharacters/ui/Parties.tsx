/** The Parties view beside the roster: the parties you run or play in, and a form to start one. */
import { useState } from 'react';
import { ArrowLeft, Plus, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import { api } from '@/lib/contract/client';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/shared/app-toast';
import { SYSTEM_LABEL } from '@features/rmhcharacters/engine/data';
import { PARTY_MAX_RUN, PARTY_NAME_MAX } from '@features/rmhcharacters/engine/party-limits';
import { createPartyApi, type PartyListItem } from '@features/rmhcharacters/engine/party.contract';
import type { GameSystem } from '@features/rmhcharacters/engine/types';
import { partyListKey, usePartyList } from './useParty';

/** The roster's entry to the Parties view. */
export function PartiesButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation('character-party');
  return (
    <Button type="button" onClick={onClick}>
      <Users aria-hidden /> {t('parties.open', { defaultValue: 'Parties' })}
    </Button>
  );
}

export function Parties({ onBack, onOpen }: { onBack: () => void; onOpen: (id: string) => void }) {
  const { t } = useTranslation('character-party');
  const refusalText = useRefusalText();
  const queryClient = useQueryClient();
  const list = usePartyList();
  const arrive = useArrival(list.isSuccess);
  const [name, setName] = useState('');
  const [system, setSystem] = useState<GameSystem>('dnd5e');
  const [busy, setBusy] = useState(false);
  const run = list.data?.parties.filter((p) => p.role === 'gm').length ?? 0;

  async function create() {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const { id } = await api(createPartyApi, { body: { name: trimmed, system } });
      setName('');
      void queryClient.invalidateQueries({ queryKey: partyListKey });
      onOpen(id);
    } catch (error) {
      toast.error(refusalText(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2 border-b border-app-border pb-4">
        <div>
          <Button type="button" variant="ghost" onClick={onBack}>
            <ArrowLeft aria-hidden /> {t('parties.back', { defaultValue: 'Characters' })}
          </Button>
        </div>
        <h1 className="text-2xl font-semibold text-app-text">{t('parties.title', { defaultValue: 'Parties' })}</h1>
        <p className="max-w-2xl text-sm text-app-text-muted">
          {t('parties.intro', {
            defaultValue:
              'A party gathers the characters at your table. Everyone in it sees each character’s armor class, hit points, conditions, Perception, speed and initiative; the game master keeps the turn order.',
          })}
        </p>
      </header>

      <form
        className="flex flex-col gap-3 border-b border-app-border pb-6 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
          <span className="font-medium text-app-text-muted">
            {t('parties.nameLabel', { defaultValue: 'Party name' })}
          </span>
          <Input
            value={name}
            maxLength={PARTY_NAME_MAX}
            dir="auto"
            onChange={(e) => setName(e.target.value)}
            placeholder={t('parties.namePlaceholder', { defaultValue: 'Tuesday night' })}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-app-text-muted">{t('parties.systemLabel', { defaultValue: 'Game' })}</span>
          <Select
            tier="app"
            value={system}
            onChange={(e) => setSystem(e.target.value === 'pf2e' ? 'pf2e' : 'dnd5e')}
            aria-label={t('parties.systemLabel', { defaultValue: 'Game' })}
          >
            <option value="dnd5e">{SYSTEM_LABEL.dnd5e}</option>
            <option value="pf2e">{SYSTEM_LABEL.pf2e}</option>
          </Select>
        </label>
        <Button type="submit" variant="primary" disabled={busy || !name.trim() || run >= PARTY_MAX_RUN}>
          <Plus aria-hidden /> {t('parties.create', { defaultValue: 'Start a party' })}
        </Button>
      </form>

      {list.isPending ? (
        <div
          className="flex flex-col gap-2"
          role="status"
          aria-label={t('parties.loading', { defaultValue: 'Loading your parties…' })}
        >
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : list.isError ? (
        <div className="flex flex-col items-start gap-3 py-4">
          <p role="alert" className="text-sm text-app-text">
            {t('parties.loadFailed', { defaultValue: 'Your parties could not be loaded.' })}
          </p>
          <Button type="button" onClick={() => void list.refetch()}>
            {t('parties.retry', { defaultValue: 'Try again' })}
          </Button>
        </div>
      ) : list.data.parties.length === 0 ? (
        <div className={cn('flex flex-col items-start gap-2 py-4', arrive)}>
          <p className="text-base font-medium text-app-text">
            {t('parties.emptyTitle', { defaultValue: 'No parties yet' })}
          </p>
          <p className="text-sm text-app-text-muted">
            {t('parties.empty', {
              defaultValue: 'Start one above and send its link to your players, or open a link a game master sent you.',
            })}
          </p>
        </div>
      ) : (
        <ul className={cn('flex flex-col', arrive)}>
          {list.data.parties.map((p) => (
            <PartyRow key={p.id} party={p} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </div>
  );
}

function PartyRow({ party, onOpen }: { party: PartyListItem; onOpen: (id: string) => void }) {
  const { t } = useTranslation('character-party');
  return (
    <li className="border-b border-app-border">
      <button
        type="button"
        onClick={() => onOpen(party.id)}
        className="flex min-h-11 w-full flex-col gap-0.5 rounded-app py-3 pl-2 pr-3 text-left transition-[background-color] duration-100 hover:bg-app-surface-hover"
      >
        <span className="truncate text-base font-medium text-app-text" dir="auto">
          {party.name}
        </span>
        <span className="flex flex-wrap items-center gap-x-3 text-sm text-app-text-muted">
          <span>
            {party.role === 'gm'
              ? t('parties.roleGm', { defaultValue: 'You are the game master' })
              : t('parties.rolePlayer', { defaultValue: 'Game master: {{name}}', name: party.gm })}
          </span>
          <span className="font-mono text-xs">{SYSTEM_LABEL[party.system]}</span>
          <span className="font-mono text-xs">
            {t('parties.players', { defaultValue: '{{count}} players', count: party.players })}
          </span>
        </span>
      </button>
    </li>
  );
}
