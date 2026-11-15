import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import {
  Check,
  X,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { IconButton } from '@/components/ui/icon-button';
import { fetchJson } from '@/lib/http';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';

export default function FortunesPanel() {
  const {
    t,
  } =
    useTranslation(
      'f-delight',
    );
  const q =
    useQuery(
      {
        queryKey:
          [
            'delight',
            'admin',
            'fortunes',
          ],
        queryFn:
          () =>
            fetchJson<{
              pending: {
                id: string;
                text: string;
              }[];
            }>(
              '/api/admin/delight/fortunes',
            ),
      },
    );
  const arrival =
    useArrival(
      !!q.data,
    );
  const review =
    async (
      id: string,
      status:
        | 'approved'
        | 'rejected',
    ) => {
      try {
        await fetchJson(
          `/api/admin/delight/fortunes/${id}`,
          {
            method:
              'POST',
            headers:
              {
                'Content-Type':
                  'application/json',
              },
            body: JSON.stringify(
              {
                status,
              },
            ),
          },
        );
        await q.refetch();
      } catch (e) {
        toast.error(
          e instanceof
            Error
            ? e.message
            : t(
                'admin-error',
                {
                  defaultValue:
                    'Something went wrong',
                },
              ),
        );
      }
    };
  if (
    q.data &&
    q
      .data
      .pending
      .length ===
      0
  ) {
    return (
      <EmptyState
        className={
          arrival
        }
        title={t(
          'fortunes-empty',
          {
            defaultValue:
              'Nothing waiting for review',
          },
        )}
      />
    );
  }
  return (
    <ul
      className={cn(
        'divide-y divide-site-border border-t border-site-border',
        arrival,
      )}
    >
      {q.data?.pending.map(
        (
          f,
        ) => (
          <li
            key={
              f.id
            }
            className="flex items-center gap-3 py-3"
          >
            <span className="min-w-0 flex-1 t-body text-site-text">
              {
                f.text
              }
            </span>
            <IconButton
              icon={
                Check
              }
              variant="ghost"
              size="icon-sm"
              label={t(
                'fortunes-approve',
                {
                  defaultValue:
                    'Approve',
                },
              )}
              onClick={() =>
                void review(
                  f.id,
                  'approved',
                )
              }
            />
            <IconButton
              icon={
                X
              }
              variant="ghost"
              size="icon-sm"
              label={t(
                'fortunes-reject',
                {
                  defaultValue:
                    'Reject',
                },
              )}
              onClick={() =>
                void review(
                  f.id,
                  'rejected',
                )
              }
            />
          </li>
        ),
      )}
    </ul>
  );
}
