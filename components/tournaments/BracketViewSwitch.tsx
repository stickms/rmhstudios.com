/**
 * Bracket or Rounds (sprint 08, feature 16): the tournament page's two ways to read one set of matches.
 *
 * The choice, in order: the `?view=` link, then this device's stored choice (`rmh.bracket.view`), then the width
 * (Rounds below 640 px). The server knows none of them, so with no `?view=` the first paint renders BOTH panels and a
 * CSS rule shows one by width: nothing shifts and the page is complete with scripting off. After mount the stored
 * choice, if any, narrows it to one panel and the selected tab is set from one `matchMedia` read (no listener).
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tabs } from '@/components/ui/tabs';
import { BracketView } from '@/components/tournaments/BracketView';
import { RoundsView } from '@/components/tournaments/RoundsView';
import { parseBracketView, type BracketViewChoice } from '@/lib/tournaments/rounds-view';
import type { SerializedTournament } from '@/lib/tournaments/tournament.server';

const STORAGE_KEY = 'rmh.bracket.view';
const ID_BASE = 'bracket-view';

function readStored(): BracketViewChoice | null {
  try {
    return parseBracketView(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function writeStored(view: BracketViewChoice) {
  try {
    window.localStorage.setItem('rmh.bracket.view', view);
  } catch {
    // Private window or blocked storage: the choice lasts for this visit only.
  }
}

interface Props {
  tournament: SerializedTournament;
  canReport: boolean;
  reportingId: string | null;
  onReport: (matchId: string, winnerEntrantId: string) => void;
  viewerId?: string | null;
  onChanged?: () => Promise<void> | void;
  /** The `?view=` search param, already parsed (null when absent or invalid). */
  urlView?: BracketViewChoice | null;
  /** Called with the new choice so the page can put it in the URL. */
  onViewChange?: (view: BracketViewChoice) => void;
}

export function BracketViewSwitch({ urlView = null, onViewChange, ...rest }: Props) {
  const { t } = useTranslation('bracket-list');
  const [stored, setStored] = useState<BracketViewChoice | null>(null);
  const [byWidth, setByWidth] = useState<BracketViewChoice>('bracket');

  useEffect(() => {
    setStored(readStored());
    try {
      setByWidth(window.matchMedia('(min-width: 640px)').matches ? 'bracket' : 'rounds');
    } catch {
      // No matchMedia: the tab strip keeps its server value.
    }
  }, []);

  const tournament = rest.tournament;
  const switchable =
    (tournament.format === 'SINGLE_ELIM' || tournament.format === 'DOUBLE_ELIM') &&
    (tournament.matches?.length ?? 0) > 0;
  if (!switchable) return <BracketView {...rest} />;

  const choice = urlView ?? stored;
  const selected = choice ?? byWidth;
  const choose = (id: string) => {
    const view = parseBracketView(id);
    if (!view) return;
    setStored(view);
    writeStored(view);
    onViewChange?.(view);
  };

  // With no choice both panels render and the media rule picks one; with a choice only that panel renders.
  const showRounds = choice === null || choice === 'rounds';
  const showBracket = choice === null || choice === 'bracket';

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Tabs
        tabs={[
          { id: 'rounds', label: t('view-rounds', { defaultValue: 'Rounds' }) },
          { id: 'bracket', label: t('view-bracket', { defaultValue: 'Bracket' }) },
        ]}
        value={selected}
        onChange={choose}
        idBase={ID_BASE}
        sheet={false}
        aria-label={t('view-label', { defaultValue: 'Bracket view' })}
      />
      {showRounds && (
        <div
          role="tabpanel"
          id={`${ID_BASE}-panel-rounds`}
          aria-labelledby={`${ID_BASE}-tab-rounds`}
          className={choice === null ? 'min-w-0 sm:hidden' : 'min-w-0'}
        >
          <RoundsView {...rest} />
        </div>
      )}
      {showBracket && (
        <div
          role="tabpanel"
          id={`${ID_BASE}-panel-bracket`}
          aria-labelledby={`${ID_BASE}-tab-bracket`}
          className={choice === null ? 'min-w-0 max-sm:hidden' : 'min-w-0'}
        >
          <BracketView {...rest} />
        </div>
      )}
    </div>
  );
}
