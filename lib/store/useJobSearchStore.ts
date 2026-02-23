import { create } from 'zustand';

interface JobSearchState {
    query: string;
    type: 'all' | 'real' | 'silly';
    sort: 'newest' | 'oldest' | 'company';
    page: number;
    setQuery: (query: string) => void;
    setType: (type: 'all' | 'real' | 'silly') => void;
    setSort: (sort: 'newest' | 'oldest' | 'company') => void;
    setPage: (page: number) => void;
    resetFilters: () => void;
}

export const useJobSearchStore = create<JobSearchState>((set) => ({
    query: '',
    type: 'all',
    sort: 'newest',
    page: 1,
    setQuery: (query) => set({ query, page: 1 }),
    setType: (type) => set({ type, page: 1 }),
    setSort: (sort) => set({ sort, page: 1 }),
    setPage: (page) => set({ page }),
    resetFilters: () => set({ query: '', type: 'all', sort: 'newest', page: 1 }),
}));
