/**
 * The open difficulty's miss heat, for the timeline's heat row and the note inspector.
 *
 * Both read the same query (one request); a difficulty with no chart row yet has nothing to ask about.
 */

import { useQuery } from '@tanstack/react-query';
import { chartMissesQuery } from '@features/slice-it/engine/editor/api-client';
import { useEditorStore } from '@features/slice-it/engine/editor/store';

export function useChartMisses() {
  const chartId = useEditorStore((s) => s.chartIds[s.active]);
  return useQuery({
    ...chartMissesQuery(chartId ?? ''),
    enabled: chartId !== null && chartId !== undefined,
  });
}
