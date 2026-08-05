'use client';

import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import type { RequestStatus } from '@/lib/requests/status';

/**
 * The status chip for a board request.
 *
 * Mapped onto the shared `Badge` semantic variants rather than given bespoke
 * colours: `success`/`warning`/`danger` already carry a glyph as well as a
 * tint, which is what keeps the five states distinguishable in the
 * colour-vision modes and in high contrast.
 */
const VARIANT: Record<RequestStatus, 'default' | 'accent' | 'warning' | 'success' | 'danger'> = {
  OPEN: 'default',
  PLANNED: 'accent',
  IN_PROGRESS: 'warning',
  SHIPPED: 'success',
  DECLINED: 'danger',
};

export function useRequestStatusLabels(): Record<RequestStatus, string> {
  const { t } = useTranslation('c-roadmap');
  return {
    OPEN: t('request-status-open', { defaultValue: 'Open' }),
    PLANNED: t('request-status-planned', { defaultValue: 'Planned' }),
    IN_PROGRESS: t('request-status-in-progress', { defaultValue: 'In progress' }),
    SHIPPED: t('request-status-shipped', { defaultValue: 'Shipped' }),
    DECLINED: t('request-status-declined', { defaultValue: 'Declined' }),
  };
}

export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  const labels = useRequestStatusLabels();
  return (
    <Badge variant={VARIANT[status]} size="sm">
      {labels[status]}
    </Badge>
  );
}
