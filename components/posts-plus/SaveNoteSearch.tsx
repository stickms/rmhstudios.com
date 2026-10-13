'use client';

import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

/** X9 - the "search my notes" box above the saves list. The hub does the fetching. */
export function SaveNoteSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { t } = useTranslation('f-posts-plus');
  const label = t('notes-search', { defaultValue: 'Search your notes' });
  return (
    <div className="relative mb-4">
      <Search
        className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-site-text-dim"
        aria-hidden
      />
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, 100))}
        placeholder={label}
        aria-label={label}
        className="ps-9"
      />
    </div>
  );
}
