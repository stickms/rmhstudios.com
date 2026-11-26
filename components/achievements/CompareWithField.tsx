import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { SearchField } from '@/components/ui/search-field';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';
import { api } from '@/lib/contract/client';
import { searchUsersApi } from '@/lib/discovery/explore.contract';
import type { ResolvedUser } from '@/lib/user-display';

import { Handle } from '@/components/ui/handle';
/**
 * "Compare with…": the people typeahead (the same search the mention and message pickers use) and a way to the
 * comparison page. Picking a result or submitting a typed handle goes to `/progress/compare?with=`.
 */
export function CompareWithField() {
  const { t } = useTranslation('achievement-compare');
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ResolvedUser[]>([]);

  const search = useDebouncedCallback(async (term: string) => {
    try {
      const res = await api(searchUsersApi, { query: { q: term } });
      setResults(res.users);
    } catch {
      // A typeahead that errors is worse than one that finds nothing: keep what was shown.
    }
  }, 250);

  function onQuery(next: string) {
    setQuery(next);
    const term = next.trim().replace(/^@/, '');
    if (!term) {
      search.cancel();
      setResults([]);
      return;
    }
    search(term);
  }

  function go(withValue: string) {
    const value = withValue.trim().replace(/^@/, '');
    if (!value) return;
    void navigate({ to: '/progress/compare', search: { with: value } });
  }

  return (
    <form
      className="pt-6"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        go(query);
      }}
    >
      <div className="flex items-center gap-3">
        <SearchField
          value={query}
          onValueChange={onQuery}
          aria-label={t('compare-with-label', { defaultValue: 'Compare with…' })}
          placeholder={t('compare-with-placeholder', { defaultValue: 'Compare with…' })}
          autoComplete="off"
          containerClassName="max-w-sm flex-1"
        />
        <Button type="submit" variant="default" disabled={!query.trim()}>
          {t('compare-submit', { defaultValue: 'Compare' })}
        </Button>
      </div>
      {results.length > 0 && query.trim() ? (
        <ul className="mt-2 max-w-sm">
          {results.map((user) => {
            const label = user.name || user.handle || user.username || '';
            const target = user.handle ?? user.id;
            return (
              <li key={user.id} className="border-b border-site-border">
                <button
                  type="button"
                  onClick={() => go(target)}
                  className="flex min-h-11 w-full items-center gap-3 py-2 text-start"
                >
                  <UserAvatar src={user.image} alt="" size={28} fallbackName={label} />
                  <span className="t-body truncate">{label}</span>
                  {user.handle ? (
                    <span className="t-meta truncate">
                      <Handle handle={user.handle} />
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </form>
  );
}
