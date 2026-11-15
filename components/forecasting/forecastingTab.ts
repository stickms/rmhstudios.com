import { useTranslation } from 'react-i18next';
import { Target } from 'lucide-react';
import type { TabItem } from '@/components/ui/tabs';

/** The "Forecasting" tab entry for the predictions page strip. */
export function useForecastingTab(): TabItem {
  const {
    t,
  } =
    useTranslation(
      'f-forecasting',
    );
  return {
    id: 'forecasting',
    label:
      t(
        'tab',
        {
          defaultValue:
            'Forecasting',
        },
      ),
    icon: Target,
  };
}
