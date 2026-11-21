import { useTranslation } from 'react-i18next';
import {
  FEEDBACK_CATEGORIES,
  type FeedbackCategory,
} from '@/lib/feedback-schema';
import type {
  FeedbackOutcome,
  FeedbackStatus,
} from '@/lib/feedback/inbox';

/** Words for categories, statuses and outcomes: plain text, never a coloured chip. Unknown ids fall back to the id. */
export function useFeedbackLabels() {
  const {
    t,
  } =
    useTranslation(
      'feedback-inbox',
    );
  const category: Record<
    FeedbackCategory,
    string
  > =
    {
      bug: t(
        'category-bug',
        {
          defaultValue:
            'Bug',
        },
      ),
      accessibility:
        t(
          'category-accessibility',
          {
            defaultValue:
              'Accessibility',
          },
        ),
      feature:
        t(
          'category-feature',
          {
            defaultValue:
              'Idea',
          },
        ),
      general:
        t(
          'category-general',
          {
            defaultValue:
              'General',
          },
        ),
      other:
        t(
          'category-other',
          {
            defaultValue:
              'Other',
          },
        ),
    };
  const status: Record<
    FeedbackStatus,
    string
  > =
    {
      new: t(
        'status-new',
        {
          defaultValue:
            'New',
        },
      ),
      in_progress:
        t(
          'status-in-progress',
          {
            defaultValue:
              'In progress',
          },
        ),
      closed:
        t(
          'status-closed',
          {
            defaultValue:
              'Closed',
          },
        ),
    };
  const outcome: Record<
    FeedbackOutcome,
    string
  > =
    {
      fixed:
        t(
          'outcome-fixed',
          {
            defaultValue:
              'Fixed',
          },
        ),
      wont_fix:
        t(
          'outcome-wont-fix',
          {
            defaultValue:
              'Will not fix',
          },
        ),
      duplicate:
        t(
          'outcome-duplicate',
          {
            defaultValue:
              'Duplicate',
          },
        ),
      not_reproducible:
        t(
          'outcome-not-reproducible',
          {
            defaultValue:
              'Could not reproduce',
          },
        ),
      answered:
        t(
          'outcome-answered',
          {
            defaultValue:
              'Answered',
          },
        ),
    };
  const lookup =
    (
      map: Record<
        string,
        string
      >,
      id: string,
    ) =>
      map[
        id
      ] ??
      id;
  return {
    categoryOf:
      (
        id: string,
      ) =>
        lookup(
          category,
          id,
        ),
    statusOf:
      (
        id: string,
      ) =>
        lookup(
          status,
          id,
        ),
    outcomeOf:
      (
        id: string,
      ) =>
        lookup(
          outcome,
          id,
        ),
    categoryIds:
      FEEDBACK_CATEGORIES,
    categoryMap:
      category,
    outcomeMap:
      outcome,
  };
}
