import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AdminHubCard } from '@/components/admin/AdminHubCard';
import { Badge } from '@/components/ui/badge';
import { apiQuery } from '@/lib/contract/client';
import { listAdminFeedbackApi } from '@/lib/feedback/inbox.contract';

/** The /admin hub card for the feedback inbox, with the number of New rows (read with one row per request). */
export function AdminFeedbackCard() {
  const {
    t,
  } =
    useTranslation(
      'feedback-inbox',
    );
  const {
    data,
  } =
    useQuery(
      apiQuery(
        listAdminFeedbackApi,
        {
          query:
            {
              status:
                'new',
              limit: 1,
            },
        },
      ),
    );
  const fresh =
    data
      ?.counts
      ?.new ??
    0;
  return (
    <AdminHubCard
      to="/admin/feedback"
      title={t(
        'card-title',
        {
          defaultValue:
            'Feedback',
        },
      )}
      description={t(
        'card-description',
        {
          defaultValue:
            'Read what members sent with its context, reply, and close it with an outcome.',
        },
      )}
      badge={
        fresh >
        0 ? (
          <Badge
            variant="danger"
            icon={
              false
            }
          >
            {
              fresh
            }
          </Badge>
        ) : undefined
      }
    />
  );
}
