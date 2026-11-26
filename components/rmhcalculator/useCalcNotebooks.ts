/**
 * The Notebook tab's calls (s15-08): the four notebook routes through their contracts and React Query, replacing the
 * untyped `toolsApi` calls the tab made from an effect.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiQuery } from '@/lib/contract/client';
import {
  createCalcNotebookApi,
  deleteCalcNotebookApi,
  listCalcNotebooksApi,
  updateCalcNotebookApi,
  type CalcNotebookInput,
} from '@/lib/tools/calc-notebooks.contract';

export function useNotebookList() {
  return useQuery(apiQuery(listCalcNotebooksApi));
}

export function useNotebookActions() {
  const queryClient = useQueryClient();
  const refreshList = () => queryClient.invalidateQueries({ queryKey: [listCalcNotebooksApi.path] });

  const create = useMutation({
    mutationFn: (body: CalcNotebookInput) => api(createCalcNotebookApi, { body }),
    onSuccess: refreshList,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: CalcNotebookInput }) =>
      api(updateCalcNotebookApi, { params: { id }, body }),
    onSuccess: refreshList,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(deleteCalcNotebookApi, { params: { id } }),
    onSuccess: refreshList,
  });
  return { create, update, remove };
}
