'use client';

/** A small people typeahead (backed by /api/users/search) that collects chips. */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { UserAvatar } from '@/components/ui/UserAvatar';
import type { CalPerson } from '@/lib/calendar/types';
import { api } from './api';

interface SearchUser {
  id: string;
  name: string | null;
  handle: string | null;
  image: string | null;
}

export function PersonPicker({
  value,
  onChange,
  max,
  label,
}: {
  value: CalPerson[];
  onChange: (next: CalPerson[]) => void;
  max: number;
  label: string;
}) {
  const { t } = useTranslation('f-calendar');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchUser[]>([]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      const res = await api<{ users: SearchUser[] }>(
        `/api/users/search?q=${encodeURIComponent(term)}`,
        { signal: ctrl.signal },
      );
      if (res.ok && res.data) setResults(res.data.users);
    }, 250);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q]);

  const chosen = new Set(value.map((v) => v.id));
  const shown = results.filter((r) => !chosen.has(r.id));

  return (
    <div className="space-y-2">
      <label className="block space-y-1 text-sm text-site-text">
        {label}
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('picker-placeholder', { defaultValue: 'Search by name or handle' })}
          disabled={value.length >= max}
          autoComplete="off"
        />
      </label>
      {shown.length > 0 && (
        <ul className="glass-overlay rounded-site p-1">
          {shown.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-site-sm px-2 py-1.5 text-left text-sm text-site-text hover:bg-site-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent"
                onClick={() => {
                  onChange([
                    ...value,
                    { id: u.id, name: u.name, handle: u.handle, image: u.image },
                  ]);
                  setQ('');
                  setResults([]);
                }}
              >
                <UserAvatar src={u.image} alt="" size={24} />
                <span className="truncate">{u.name ?? u.handle}</span>
                {u.handle && <span className="text-xs text-site-text-dim">@{u.handle}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {value.map((p) => (
            <li
              key={p.id}
              className="glass-fill flex items-center gap-1.5 rounded-full py-1 pl-1 pr-1.5 text-sm text-site-text"
            >
              <UserAvatar src={p.image} alt="" size={22} />
              {p.name ?? p.handle}
              <button
                type="button"
                aria-label={t('picker-remove', {
                  defaultValue: 'Remove {{name}}',
                  name: p.name ?? p.handle ?? '',
                })}
                className="rounded-full p-0.5 text-site-text-muted hover:text-site-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent"
                onClick={() => onChange(value.filter((v) => v.id !== p.id))}
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
