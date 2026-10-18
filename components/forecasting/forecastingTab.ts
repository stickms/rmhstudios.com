import { useTranslation } from 'react-i18next';
import { Target } from 'lucide-react';
import type { LiquidTab } from '@/components/ui/liquid-tabs';

/** The "Forecasting" tab entry for the predictions page strip. */
export function useForecastingTab(): LiquidTab {
  const { t } = useTranslation('f-forecasting');
  return { id: 'forecasting', label: t('tab', { defaultValue: 'Forecasting' }), icon: Target };
}
