import { create } from 'zustand';

interface JobSearchState {
    query: string;
    sort: 'newest' | 'oldest' | 'company';
    page: number;
    setQuery: (query: string) => void;
    setSort: (sort: 'newest' | 'oldest' | 'company') => void;
    setPage: (page: number) => void;
    resetFilters: () => void;
}

export const useJobSearchStore = create<JobSearchState>((set) => ({
    query: '',
    sort: 'newest',
    page: 1,
    setQuery: (query) => set({ query, page: 1 }),
    setSort: (sort) => set({ sort, page: 1 }),
    setPage: (page) => set({ page }),
    resetFilters: () => set({ query: '', sort: 'newest', page: 1 }),
}));
