import { createFileRoute } from '@tanstack/react-router';
import { AliasMissesPanel } from '@features/medschools/ui/AliasMissesPanel';

export const Route =
  createFileRoute(
    '/_site/admin/medschools',
  )(
    {
      head: () => ({
        meta: [
          {
            title:
              'Med Schools aliases | Admin | RMH Studios',
          },
        ],
      }),
      component:
        AliasMissesPanel,
    },
  );
