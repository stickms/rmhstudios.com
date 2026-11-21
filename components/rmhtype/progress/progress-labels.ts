/**
 * The words and number formats for the progress page. `lib/rmhtype/progress.ts` is
 * data (ids and numbers), so the strings live here, where the extractor can see them.
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

export function useProgressLabels() {
  const {
    t,
    i18n,
  } =
    useTranslation(
      'rmhtype-progress',
    );
  return useMemo(() => {
    const lang =
      i18n.language;
    const length: Record<
      string,
      string
    > =
      {
        short:
          t(
            'length-short',
            {
              defaultValue:
                'Short',
            },
          ),
        medium:
          t(
            'length-medium',
            {
              defaultValue:
                'Medium',
            },
          ),
        long: t(
          'length-long',
          {
            defaultValue:
              'Long',
          },
        ),
      };
    const difficulty: Record<
      string,
      string
    > =
      {
        easy: t(
          'difficulty-easy',
          {
            defaultValue:
              'Easy',
          },
        ),
        medium:
          t(
            'difficulty-medium',
            {
              defaultValue:
                'Medium',
            },
          ),
        hard: t(
          'difficulty-hard',
          {
            defaultValue:
              'Hard',
          },
        ),
      };
    const num1 =
      new Intl.NumberFormat(
        lang,
        {
          maximumFractionDigits: 1,
        },
      );
    const signed =
      new Intl.NumberFormat(
        lang,
        {
          maximumFractionDigits: 1,
          signDisplay:
            'exceptZero',
        },
      );
    const date =
      new Intl.DateTimeFormat(
        lang,
        {
          dateStyle:
            'medium',
        },
      );
    const dayUtc =
      new Intl.DateTimeFormat(
        lang,
        {
          dateStyle:
            'medium',
          timeZone:
            'UTC',
        },
      );
    const dateTime =
      new Intl.DateTimeFormat(
        lang,
        {
          dateStyle:
            'medium',
          timeStyle:
            'short',
        },
      );
    return {
      length:
        (
          id: string,
        ) =>
          length[
            id
          ] ??
          id,
      difficulty:
        (
          id: string,
        ) =>
          difficulty[
            id
          ] ??
          id,
      wpm: (
        n: number,
      ) =>
        t(
          'value-wpm',
          {
            defaultValue:
              '{{value}} wpm',
            value:
              num1.format(
                n,
              ),
          },
        ),
      signedWpm:
        (
          n: number,
        ) =>
          t(
            'value-wpm',
            {
              defaultValue:
                '{{value}} wpm',
              value:
                signed.format(
                  n,
                ),
            },
          ),
      accuracy:
        (
          n: number,
        ) =>
          t(
            'value-percent',
            {
              defaultValue:
                '{{value}}%',
              value:
                num1.format(
                  n,
                ),
            },
          ),
      number:
        (
          n: number,
        ) =>
          num1.format(
            n,
          ),
      /** An instant, in the viewer's time zone. */
      date: (
        iso: string,
      ) =>
        date.format(
          new Date(
            iso,
          ),
        ),
      dateTime:
        (
          iso: string,
        ) =>
          dateTime.format(
            new Date(
              iso,
            ),
          ),
      /** A `YYYY-MM-DD` bucket from the server: a calendar day, so it is never shifted by a zone. */
      day: (
        day: string,
      ) =>
        dayUtc.format(
          new Date(
            `${day}T00:00:00Z`,
          ),
        ),
    };
  }, [
    t,
    i18n.language,
  ]);
}
