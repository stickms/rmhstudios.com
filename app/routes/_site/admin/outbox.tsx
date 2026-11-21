import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { AdminBody } from '@/components/admin/AdminBody';
import { OutboxConsole } from '@/components/admin/outbox/OutboxConsole';
import { TOPIC_PATTERN } from '@/lib/admin/outbox-admin';

export const Route =
  createFileRoute(
    '/_site/admin/outbox',
  )(
    {
      head: () => ({
        meta: [
          {
            title:
              'Outbox | Admin | RMH Studios',
          },
        ],
      }),
      // The open topic is in the address, so Back returns to the list and a link to a failing topic works.
      validateSearch:
        (
          search: Record<
            string,
            unknown
          >,
        ): {
          topic?: string;
        } =>
          typeof search.topic ===
            'string' &&
          TOPIC_PATTERN.test(
            search.topic,
          )
            ? {
                topic:
                  search.topic,
              }
            : {},
      component:
        AdminOutboxPage,
    },
  );

function AdminOutboxPage() {
  const {
    t,
  } =
    useTranslation(
      'admin-outbox',
    );
  const {
    topic,
  } =
    Route.useSearch();
  return (
    <PageLayout
      title={t(
        'page-title',
        {
          defaultValue:
            'Outbox',
        },
      )}
      description={t(
        'page-description',
        {
          defaultValue:
            'Events that gave up delivering, why, and a way to send them again or discard them.',
        },
      )}
      wide
      backTo="/admin"
    >
      <AdminBody width="narrow">
        <OutboxConsole
          topic={
            topic
          }
        />
      </AdminBody>
    </PageLayout>
  );
}
