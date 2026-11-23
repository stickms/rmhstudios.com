/**
 * The /admin/medschools search params. Kept apart from `ui/AdminMedSchoolsPage.tsx` because the route's
 * `validateSearch` is not code-split: importing it from the page module would put the whole admin page (and what it
 * imports) on every page's critical path.
 */
export const ADMIN_TABS = ['aliases', 'limits'] as const;
export type AdminTab = (typeof ADMIN_TABS)[number];

/** Hand-rolled like the other med schools routes: no zod in the entry. */
export const parseAdminSearch = (search: Record<string, unknown>): { tab?: AdminTab } =>
  ADMIN_TABS.includes(search.tab as AdminTab) ? { tab: search.tab as AdminTab } : {};
