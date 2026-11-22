/**
 * The host's "Award match" on an overdue match (s07-06): a dialog with the two
 * entrants as choices; picking one asks for confirmation naming the winner, and
 * only then awards. Nothing is awarded without this person-driven step: a
 * walkover moves payouts.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface AwardChoice {
  entrantId: string;
  name: string;
}

interface Props {
  /** The two entrants of the match. */
  choices: readonly [
    AwardChoice,
    AwardChoice,
  ];
  /** Awards the match; throws to report a failure (the caller shows it). */
  onAward: (
    winnerEntrantId: string,
  ) => Promise<void>;
  busy?: boolean;
}

export function AwardMatchDialog({
  choices,
  onAward,
  busy = false,
}: Props) {
  const {
    t,
  } =
    useTranslation(
      'match-scheduling',
    );
  const confirm =
    useConfirm();
  const [
    open,
    setOpen,
  ] =
    useState(
      false,
    );

  const pick =
    async (
      choice: AwardChoice,
    ) => {
      setOpen(
        false,
      );
      const ok =
        await confirm(
          {
            title:
              t(
                'award-confirm-title',
                {
                  defaultValue:
                    'Award the match to {{name}}?',
                  name: choice.name,
                },
              ),
            description:
              t(
                'award-confirm-body',
                {
                  defaultValue:
                    '{{name}} advances and the other player is out of this match. This cannot be undone.',
                  name: choice.name,
                },
              ),
            confirmLabel:
              t(
                'award-confirm',
                {
                  defaultValue:
                    'Award match',
                },
              ),
          },
        );
      if (
        ok
      )
        await onAward(
          choice.entrantId,
        );
    };

  return (
    <>
      <Button
        size="xs"
        variant="default"
        loading={
          busy
        }
        onClick={() =>
          setOpen(
            true,
          )
        }
      >
        {t(
          'award-match',
          {
            defaultValue:
              'Award match',
          },
        )}
      </Button>
      <Dialog
        open={
          open
        }
        onOpenChange={
          setOpen
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t(
                'award-title',
                {
                  defaultValue:
                    'Award match',
                },
              )}
            </DialogTitle>
            <DialogDescription>
              {t(
                'award-body',
                {
                  defaultValue:
                    'This match is past its deadline. Choose who turned up.',
                },
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {choices.map(
              (
                choice,
              ) => (
                <Button
                  key={
                    choice.entrantId
                  }
                  variant="default"
                  className="w-full justify-start"
                  onClick={() =>
                    void pick(
                      choice,
                    )
                  }
                >
                  {t(
                    'award-to',
                    {
                      defaultValue:
                        'Award to {{name}}',
                      name: choice.name,
                    },
                  )}
                </Button>
              ),
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
