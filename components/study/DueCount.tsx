import { Link } from '@tanstack/react-router';
import { GraduationCap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

/** "Review all · N due" on `/study`. The count leaves out suspended cards. */
export function ReviewAllLink({
  count,
}: {
  count: number;
}) {
  const {
    t,
  } =
    useTranslation(
      'study-queue',
    );
  return (
    <div className="border-b border-site-border px-4 py-3">
      <Link
        to={
          '/study/review' as string
        }
      >
        <Button
          variant="default"
          className="w-full gap-2"
        >
          <GraduationCap
            className="h-4 w-4"
            aria-hidden
          />
          {t(
            'review-all-due',
            {
              count,
              defaultValue:
                'Review all · {{count}} due',
            },
          )}
        </Button>
      </Link>
    </div>
  );
}

/** A deck row's due count; nothing when none are due. */
export function DeckDue({
  count,
}: {
  count: number;
}) {
  const {
    t,
  } =
    useTranslation(
      'study-queue',
    );
  if (
    count <=
    0
  )
    return null;
  return (
    <span className="t-meta">
      {t(
        'deck-due',
        {
          count,
          defaultValue:
            '· {{count}} due',
        },
      )}
    </span>
  );
}
