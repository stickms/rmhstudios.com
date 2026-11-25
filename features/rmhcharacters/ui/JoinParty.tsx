/**
 * The join screen an invite link opens (`/rmhcharacters?party=<code>`): which party, which of your characters, and —
 * before anything is confirmed — exactly what the party sees and what the switch adds. The switch is off until the
 * player turns it on.
 */
import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useArrival } from '@/components/ui/arrive';
import { api } from '@/lib/contract/client';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/shared/app-toast';
import { SYSTEM_LABEL } from '@features/rmhcharacters/engine/data';
import { joinPartyApi } from '@features/rmhcharacters/engine/party.contract';
import { useRoster } from '@features/rmhcharacters/engine/store';
import { partyListKey, useJoinPreview } from './useParty';

export function JoinParty({
  code,
  onJoined,
  onCancel,
}: {
  code: string;
  onJoined: (partyId: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation('character-party');
  const refusalText = useRefusalText();
  const queryClient = useQueryClient();
  const preview = useJoinPreview(code);
  const arrive = useArrival(preview.isSuccess);
  const roster = useRoster((s) => s.characters);
  const [characterId, setCharacterId] = useState('');
  const [sheetShared, setSheetShared] = useState(false);
  const [busy, setBusy] = useState(false);
  const party = preview.data?.party;
  const own = party ? roster.filter((c) => c.system === party.system) : [];

  async function join() {
    if (!characterId || busy) return;
    setBusy(true);
    try {
      const { id } = await api(joinPartyApi, { body: { code, characterId, sheetShared } });
      void queryClient.invalidateQueries({ queryKey: partyListKey });
      onJoined(id);
    } catch (error) {
      toast.error(refusalText(error));
    } finally {
      setBusy(false);
    }
  }

  const cancel = (
    <Button type="button" variant="ghost" onClick={onCancel}>
      <ArrowLeft aria-hidden /> {t('join.back', { defaultValue: 'Characters' })}
    </Button>
  );

  if (preview.isPending)
    return (
      <div
        className="flex flex-col gap-4"
        role="status"
        aria-label={t('join.loading', { defaultValue: 'Opening the invitation…' })}
      >
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  if (preview.isError || !party)
    return (
      <div className="flex flex-col items-start gap-3">
        {cancel}
        <p className="text-base font-medium text-app-text">
          {t('join.invalidTitle', { defaultValue: 'This invitation does not work' })}
        </p>
        <p role="alert" className="max-w-xl text-sm text-app-text-muted">
          {t('join.invalid', { defaultValue: 'The link may be old: ask your game master for a new one.' })}
        </p>
      </div>
    );

  return (
    <div className={cn('flex flex-col gap-6', arrive)}>
      <div>{cancel}</div>
      <header className="flex flex-col gap-1 border-b border-app-border pb-4">
        <h1 className="text-2xl font-semibold text-app-text" dir="auto">
          {t('join.title', { defaultValue: 'Join {{name}}', name: party.name })}
        </h1>
        <p className="text-sm text-app-text-muted">
          {SYSTEM_LABEL[party.system]} · {t('join.gm', { defaultValue: 'Game master' })}: <bdi>{party.gm}</bdi>
        </p>
      </header>

      <section className="flex flex-col gap-2 border-b border-app-border pb-5">
        <h2 className="text-lg font-semibold text-app-text">
          {t('join.sees', { defaultValue: 'What the party sees' })}
        </h2>
        <p className="max-w-2xl text-sm text-app-text-muted">
          {t('join.seesBody', {
            defaultValue:
              'Everyone in the party sees your character’s name, class and level, armor class, hit points, conditions, Perception, speed and initiative bonus. They never see your portrait, notes, backstory, inventory or money. You can leave at any time.',
          })}
        </p>
      </section>

      <section className="flex flex-col gap-3 border-b border-app-border pb-5">
        <h2 className="text-lg font-semibold text-app-text">{t('join.bring', { defaultValue: 'Your character' })}</h2>
        {own.length === 0 ? (
          <p className="text-sm text-app-text-muted">
            {t('join.noCharacters', {
              defaultValue:
                'You have no character for this game yet. Make one in RMHCharacters, then open the link again.',
            })}
          </p>
        ) : (
          <label className="flex max-w-sm flex-col gap-1 text-sm">
            <span className="font-medium text-app-text-muted">
              {t('join.pick', { defaultValue: 'Character to bring' })}
            </span>
            <Select
              tier="app"
              value={characterId}
              onChange={(e) => setCharacterId(e.target.value)}
              aria-label={t('join.pick', { defaultValue: 'Character to bring' })}
            >
              <option value="">{t('join.choose', { defaultValue: 'Choose a character' })}</option>
              {own.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || t('join.unnamed', { defaultValue: 'Unnamed character' })}
                </option>
              ))}
            </Select>
          </label>
        )}
      </section>

      <section className="flex flex-col gap-2 border-b border-app-border pb-5">
        <div className="flex items-start gap-3">
          <Switch
            checked={sheetShared}
            onCheckedChange={setSheetShared}
            aria-label={t('join.share', { defaultValue: 'Let the game master open my full sheet' })}
            aria-describedby="join-share-hint"
          />
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-app-text">
              {t('join.share', { defaultValue: 'Let the game master open my full sheet' })}
            </span>
            <span id="join-share-hint" className="max-w-xl text-sm text-app-text-muted">
              {t('join.shareHint', {
                defaultValue:
                  'Off unless you turn it on. When on, only the game master can open your whole sheet, read only. Your private notes and portrait are never sent. You can turn it off on the party page.',
              })}
            </span>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="primary" disabled={!characterId || busy} onClick={() => void join()}>
          {t('join.confirm', { defaultValue: 'Join party' })}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('join.cancel', { defaultValue: 'Not now' })}
        </Button>
      </div>
    </div>
  );
}
