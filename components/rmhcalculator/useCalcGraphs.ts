/**
 * The calculator's saved-graph calls (s15-08), all through React Query and the typed contracts in
 * `lib/rmhcalculator/graphs.contract.ts`: the list is a query, a save, rename, re-plot or delete is a mutation, and
 * opening one is a fetch from an event handler. The components that use them hold no `api()` call of their own.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiQuery } from '@/lib/contract/client';
import {
  createCalcGraphApi,
  deleteCalcGraphApi,
  getCalcGraphApi,
  listCalcGraphsApi,
  updateCalcGraphApi,
} from '@/lib/rmhcalculator/graphs.contract';
import type { CalcGraphFull, CreateCalcGraphBody, UpdateCalcGraphBody } from '@/lib/rmhcalculator/graphs-schema';

export function useSavedGraphs() {
  return useQuery(apiQuery(listCalcGraphsApi));
}

export function useCalcGraphActions() {
  const queryClient = useQueryClient();
  const refreshList = () => queryClient.invalidateQueries({ queryKey: [listCalcGraphsApi.path] });

  const create = useMutation({
    mutationFn: (body: CreateCalcGraphBody) => api(createCalcGraphApi, { body }),
    onSuccess: refreshList,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateCalcGraphBody }) =>
      api(updateCalcGraphApi, { params: { id }, body }),
    onSuccess: refreshList,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(deleteCalcGraphApi, { params: { id } }),
    onSuccess: refreshList,
  });

  /** One saved graph with its stored result, fetched from an event handler: no model call is involved. */
  const open = async (id: string): Promise<CalcGraphFull> => {
    const { graph } = await api(getCalcGraphApi, { params: { id } });
    return graph;
  };

  return { create, update, remove, open };
}
