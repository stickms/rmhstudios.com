/**
 * FilterChips — filter bar for the Jobs route.
 *
 * Preset chips, program-type toggles, city free-text, non-US toggle,
 * debounced (300ms) search box, sort selector.
 */

import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { ListJobsFilters } from '@/lib/rmhladder/server/queries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

const PRESETS: { value: NonNullable<ListJobsFilters['preset']>; label: string }[] = [
  { value: 'new',        label: 'New'        },
  { value: 'finance',    label: 'Finance'    },
  { value: 'consulting', label: 'Consulting' },
  { value: 'tech',       label: 'Tech'       },
  { value: 'expiring',   label: 'Expiring'   },
  { value: 'remote',     label: 'Remote'     },
  { value: 'saved',      label: 'Saved'      },
  { value: 'ignored',    label: 'Ignored'    },
];

const PROGRAM_TYPES: { value: string; label: string }[] = [
  { value: 'internship',            label: 'Internship'  },
  { value: 'summer_analyst',        label: 'SA'          },
  { value: 'summer_associate',      label: 'Assoc'       },
  { value: 'analyst_program',       label: 'Analyst Pgm' },
  { value: 'rotational_program',    label: 'Rotational'  },
  { value: 'new_grad',              label: 'New Grad'    },
  { value: 'leadership_development',label: 'LDP'         },
  { value: 'entry_level',           label: 'Entry Level' },
  { value: 'mba',                   label: 'MBA'         },
];

interface FilterChipsProps {
  search: ListJobsFilters;
  onUpdate: (patch: Partial<ListJobsFilters>) => void;
  showPersonalPresets?: boolean;
}

export function FilterChips({ search, onUpdate, showPersonalPresets = false }: FilterChipsProps) {
  const { t } = useTranslation('site');
  // ── Search box (debounced) ────────────────────────────────────────
  const [inputValue, setInputValue] = useState(search.q ?? '');
  const isUserTypingRef = useRef(false);
  const isMountedRef = useRef(false);
  const onUpdateRef = useRef(onUpdate);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  });

  // Sync external q changes (URL changed by other means) into input
  useEffect(() => {
    if (!isUserTypingRef.current) {
      setInputValue(search.q ?? '');
    }
  }, [search.q]);

  // Debounce user input → URL
  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      return;
    }
    if (!isUserTypingRef.current) return;
    const id = setTimeout(() => {
      isUserTypingRef.current = false;
      onUpdateRef.current({ q: inputValue || undefined });
    }, 300);
    return () => clearTimeout(id);
  }, [inputValue]);

  // ── City input (commit on blur / Enter) ───────────────────────────
  const [cityInput, setCityInput] = useState((search.cities ?? []).join(', '));

  useEffect(() => {
    setCityInput((search.cities ?? []).join(', '));
  }, [search.cities]);

  function commitCities(raw: string) {
    const cities = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    onUpdate({ cities: cities.length ? cities : undefined });
  }

  // ── Handlers ─────────────────────────────────────────────────────
  function togglePreset(preset: NonNullable<ListJobsFilters['preset']>) {
    onUpdate({ preset: search.preset === preset ? undefined : preset });
  }

  function toggleProgramType(pt: string) {
    const current = search.programTypes ?? [];
    const next = current.includes(pt)
      ? current.filter((v) => v !== pt)
      : [...current, pt];
    onUpdate({ programTypes: next.length ? next : undefined });
  }

  return (
    <div className="mb-5 space-y-3 rounded-site border border-site-border bg-site-surface p-3" role="search" aria-label={t('ladder.jobFilters', { defaultValue: 'Job filters' })}>
      {/* Preset chips */}
      <div className="flex flex-wrap gap-2">
        {PRESETS.filter(({ value }) => showPersonalPresets || (value !== 'saved' && value !== 'ignored')).map(({ value, label }) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={search.preset === value ? 'accent' : 'outline'}
            className="min-h-11"
            aria-pressed={search.preset === value}
            onClick={() => togglePreset(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      {/* Program type toggles */}
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-site-text-muted">
          {t('ladder.programTypes', { defaultValue: 'Program types' })}
        </p>
        <div className="flex flex-wrap gap-2">
          {PROGRAM_TYPES.map(({ value, label }) => (
            <Button
              key={value}
              type="button"
              size="xs"
              variant={(search.programTypes ?? []).includes(value) ? 'accent' : 'ghost'}
              className="min-h-9"
              aria-pressed={(search.programTypes ?? []).includes(value)}
              onClick={() => toggleProgramType(value)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]">
        <Input
          type="text"
          placeholder={t('ladder.citiesPlaceholder', { defaultValue: 'Cities (comma-separated)' })}
          value={cityInput}
          aria-label={t('ladder.filterCities', { defaultValue: 'Filter by cities' })}
          onChange={(e) => setCityInput(e.target.value)}
          onBlur={(e) => commitCities(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitCities((e.target as HTMLInputElement).value);
          }}
        />

        <Input
          type="search"
          placeholder={t('ladder.searchJobs', { defaultValue: 'Search jobs or companies…' })}
          value={inputValue}
          aria-label={t('ladder.searchJobTitles', { defaultValue: 'Search jobs, companies, and locations' })}
          onChange={(e) => {
            isUserTypingRef.current = true;
            setInputValue(e.target.value);
          }}
        />

        <Select
          value={search.sort ?? 'relevance'}
          aria-label={t('ladder.sortJobs', { defaultValue: 'Sort jobs by' })}
          onChange={(e) => onUpdate({ sort: e.target.value as ListJobsFilters['sort'] })}
        >
          <option value="relevance">{t('ladder.relevance', { defaultValue: 'Relevance' })}</option>
          <option value="posted">{t('ladder.posted', { defaultValue: 'Posted' })}</option>
          <option value="deadline">{t('ladder.deadline', { defaultValue: 'Deadline' })}</option>
        </Select>
      </div>
    </div>
  );
}
