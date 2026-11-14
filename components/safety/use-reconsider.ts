import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  errorField,
  HttpError,
} from '@/lib/http';

/**
 * S1: wrap a reply POST (a contract call that throws `HttpError`). If the server answers 409 `reconsider`, ask once and
 * resend with `confirmReconsider: true` on "Post anyway". Resolves null when the
 * author chose to keep editing (nothing was posted).
 */
export function useReconsider() {
  const {
    t,
  } =
    useTranslation(
      'f-safety',
    );
  const confirm =
    useConfirm();
  return useCallback(
    async <
      T,
    >(
      send: (
        confirmReconsider: boolean,
      ) => Promise<T>,
    ): Promise<T | null> => {
      try {
        return await send(
          false,
        );
      } catch (e) {
        if (
          !(
            e instanceof
            HttpError
          ) ||
          e.status !==
            409 ||
          errorField(
            e,
            'code',
          ) !==
            'reconsider'
        ) {
          throw e;
        }
      }
      const ok =
        await confirm(
          {
            title:
              t(
                'reconsider-title',
                {
                  defaultValue:
                    'Review this before posting?',
                },
              ),
            description:
              t(
                'reconsider-body',
                {
                  defaultValue:
                    'This reply may come across as hostile to the person reading it. You can edit it, or post it as it is.',
                },
              ),
            confirmLabel:
              t(
                'reconsider-post',
                {
                  defaultValue:
                    'Post anyway',
                },
              ),
            cancelLabel:
              t(
                'reconsider-edit',
                {
                  defaultValue:
                    'Keep editing',
                },
              ),
          },
        );
      return ok
        ? send(
            true,
          )
        : null;
    },
    [
      confirm,
      t,
    ],
  );
}
