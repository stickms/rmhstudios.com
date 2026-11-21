/**
 * The words for the touch-typing course: unit names, lesson titles and finger names.
 *
 * `lib/rmhtype/lessons.ts` is data (ids and numbers), so the strings live here,
 * where the extractor can see them. Finger and unit names have no interpolated
 * user text, so nothing here is HTML-escaped on the way through.
 */
import { useTranslation } from 'react-i18next';
import type {
  FingerId,
  Lesson,
} from '@/lib/rmhtype/lessons';

export function useLessonLabels() {
  const {
    t,
  } =
    useTranslation(
      'rmhtype-lessons',
    );

  const fingerNames: Record<
    FingerId,
    string
  > =
    {
      'left-pinky':
        t(
          'finger-left-pinky',
          {
            defaultValue:
              'left pinky',
          },
        ),
      'left-ring':
        t(
          'finger-left-ring',
          {
            defaultValue:
              'left ring finger',
          },
        ),
      'left-middle':
        t(
          'finger-left-middle',
          {
            defaultValue:
              'left middle finger',
          },
        ),
      'left-index':
        t(
          'finger-left-index',
          {
            defaultValue:
              'left index finger',
          },
        ),
      'right-index':
        t(
          'finger-right-index',
          {
            defaultValue:
              'right index finger',
          },
        ),
      'right-middle':
        t(
          'finger-right-middle',
          {
            defaultValue:
              'right middle finger',
          },
        ),
      'right-ring':
        t(
          'finger-right-ring',
          {
            defaultValue:
              'right ring finger',
          },
        ),
      'right-pinky':
        t(
          'finger-right-pinky',
          {
            defaultValue:
              'right pinky',
          },
        ),
      thumb:
        t(
          'finger-thumb',
          {
            defaultValue:
              'thumb',
          },
        ),
    };

  const unitTitles: Record<
    number,
    string
  > =
    {
      1: t(
        'unit-1',
        {
          defaultValue:
            'Home row',
        },
      ),
      2: t(
        'unit-2',
        {
          defaultValue:
            'Top row',
        },
      ),
      3: t(
        'unit-3',
        {
          defaultValue:
            'Bottom row',
        },
      ),
      4: t(
        'unit-4',
        {
          defaultValue:
            'Capitals',
        },
      ),
      5: t(
        'unit-5',
        {
          defaultValue:
            'Numbers',
        },
      ),
      6: t(
        'unit-6',
        {
          defaultValue:
            'Punctuation',
        },
      ),
    };

  return {
    fingerName:
      (
        finger: FingerId,
      ) =>
        fingerNames[
          finger
        ],
    unitTitle:
      (
        unit: number,
      ) =>
        unitTitles[
          unit
        ] ??
        '',
    lessonTitle:
      (
        lesson: Lesson,
      ) =>
        lesson.review
          ? t(
              'lesson-title-review',
              {
                n: lesson.n,
                defaultValue:
                  'Lesson {{n}}: review',
              },
            )
          : t(
              'lesson-title',
              {
                n: lesson.n,
                defaultValue:
                  'Lesson {{n}}',
              },
            ),
  };
}
