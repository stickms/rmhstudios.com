'use client';

/**
 * How to play, and the one thing a player cannot discover by playing: that
 * abandoning a selection which can no longer reach a GlobeSet is recorded as a
 * dead end. A metric nobody is told about is a trap, so it is stated here, in
 * the panel the "How to play" button opens, beside the rule it measures.
 */

import { useTranslation } from 'react-i18next';
import { DOT_COLORS } from '@/lib/globeset/cards';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function GlobeSetRules({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('c-daily-puzzles');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t('globeset-rules-title', { defaultValue: 'How GlobeSet works' })}
          </DialogTitle>
          <DialogDescription>
            {t('globeset-rules-lede', {
              defaultValue: 'Sixty-three cards, seven face up. Clear the deck as fast as you can.',
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm text-site-text">
          <section>
            <h3 className="font-semibold">
              {t('globeset-rules-what-title', { defaultValue: 'What counts as a GlobeSet' })}
            </h3>
            <p className="mt-1 text-site-text-muted">
              {t('globeset-rules-what-body', {
                defaultValue:
                  'Any group of cards on which every colour appears an even number of times — twice, four times, or not at all. Pick cards and the board claims them the moment that is true, so there is no button to press and no wrong answer to submit.',
              })}
            </p>
            <ul className="mt-2 flex items-center gap-2" aria-hidden>
              {DOT_COLORS.map((dot) => (
                <li
                  key={dot.id}
                  className="h-4 w-4 rounded-full"
                  style={{ background: `var(${dot.token})` }}
                />
              ))}
            </ul>
          </section>

          <section>
            <h3 className="font-semibold">
              {t('globeset-rules-ledger-title', { defaultValue: 'Read the ledger' })}
            </h3>
            <p className="mt-1 text-site-text-muted">
              {t('globeset-rules-ledger-body', {
                defaultValue:
                  'Under the board, a colour lights up while your selection holds an odd number of it. Switch all six off and the cards are yours.',
              })}
            </p>
          </section>

          <section>
            <h3 className="font-semibold">
              {t('globeset-rules-guarantee-title', { defaultValue: 'There is always one' })}
            </h3>
            <p className="mt-1 text-site-text-muted">
              {t('globeset-rules-guarantee-body', {
                defaultValue:
                  'Seven cards can be combined 127 ways but there are only 64 possible colour totals, so two combinations always match — and the difference between them is a GlobeSet. A full board is never stuck, and the deck always clears.',
              })}
            </p>
          </section>

          <section>
            <h3 className="font-semibold">
              {t('globeset-rules-scoring-title', { defaultValue: 'What is being measured' })}
            </h3>
            <p className="mt-1 text-site-text-muted">
              {t('globeset-rules-scoring-body', {
                defaultValue:
                  'The leaderboard ranks time. Two other numbers show up in your results: hints, and dead ends — selections you backed out of that could no longer have become a GlobeSet. Dead ends are counted quietly during the run, because flagging them live would tell you which cards to try next.',
              })}
            </p>
          </section>

          <section>
            <h3 className="font-semibold">
              {t('globeset-rules-globe-title', { defaultValue: 'Turning the globe' })}
            </h3>
            <p className="mt-1 text-site-text-muted">
              {t('globeset-rules-globe-body', {
                defaultValue:
                  'The seven cards are pinned to a glass sphere. Drag anywhere to spin it and let go to let it coast; a card facing you can be tapped, one on the far side is dimmed until you bring it round. Prefer them laid out flat? The Globe button switches to a plain board and back — same deck, same run.',
              })}
            </p>
          </section>

          <section>
            <h3 className="font-semibold">
              {t('globeset-rules-gyro-title', { defaultValue: 'Walk around it' })}
            </h3>
            <p className="mt-1 text-site-text-muted">
              {t('globeset-rules-gyro-body', {
                defaultValue:
                  'On a phone or tablet, "Walk around it" hands the globe to the gyroscope: it stops being stuck to your screen and starts sitting still in the room. Hold the device steady and it holds; step around it and its far side comes to meet you. Drag still works on top of it, and switching it off leaves the globe exactly where it was.',
              })}
            </p>
          </section>

          <section>
            <h3 className="font-semibold">
              {t('globeset-rules-keys-title', { defaultValue: 'Keyboard' })}
            </h3>
            <p className="mt-1 text-site-text-muted">
              {t('globeset-rules-keys-body', {
                defaultValue:
                  '1–7 pick a card, Esc clears the selection, H takes a hint. Tabbing to a card turns the globe until that card is facing you.',
              })}
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
