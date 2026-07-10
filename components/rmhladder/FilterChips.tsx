/**
 * FilterChips — filter bar for the Jobs route.
 *
 * Preset chips, program-type toggles, city free-text, non-US toggle,
 * debounced (300ms) search box, sort selector.
 */

import { useState, useEffect, useRef } from 'react';
import type { ListJobsFilters } from '@/lib/rmhladder/server/queries';

const PRESETS: { value: NonNullable<ListJobsFilters['preset']>; label: string }[] = [
  { value: 'new',        label: 'New'        },
  { value: 'finance',    label: 'Finance'    },
  { value: 'consulting', label: 'Consulting' },
  { value: 'tech',       label: 'Tech'       },
  { value: 'expiring',   label: 'Expiring'   },
  { value: 'remote',     label: 'Remote'     },
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
}

export function FilterChips({ search, onUpdate }: FilterChipsProps) {
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
    <div className="rl-filter-bar" role="group" aria-label="Job filters">
      {/* Preset chips */}
      {PRESETS.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          className={`rl-chip ${search.preset === value ? 'rl-chip--active' : ''}`}
          aria-pressed={search.preset === value}
          onClick={() => togglePreset(value)}
        >
          {label}
        </button>
      ))}

      <div className="rl-filter-divider" aria-hidden="true" />

      {/* Program type toggles */}
      {PROGRAM_TYPES.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          className={`rl-chip ${(search.programTypes ?? []).includes(value) ? 'rl-chip--active' : ''}`}
          aria-pressed={(search.programTypes ?? []).includes(value)}
          onClick={() => toggleProgramType(value)}
        >
          {label}
        </button>
      ))}

      <div className="rl-filter-divider" aria-hidden="true" />

      {/* City input */}
      <input
        type="text"
        className="rl-city-input"
        placeholder="Cities (comma-separated)"
        value={cityInput}
        aria-label="Filter by cities"
        onChange={(e) => setCityInput(e.target.value)}
        onBlur={(e) => commitCities(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commitCities((e.target as HTMLInputElement).value);
        }}
      />

      {/* Non-US toggle */}
      <label className="rl-toggle">
        <input
          type="checkbox"
          checked={search.includeNonUS === true}
          onChange={(e) => onUpdate({ includeNonUS: e.target.checked || undefined })}
        />
        Include non-US
      </label>

      <div className="rl-filter-divider" aria-hidden="true" />

      {/* Search box */}
      <input
        type="search"
        className="rl-search-box"
        placeholder="Search titles…"
        value={inputValue}
        aria-label="Search job titles"
        onChange={(e) => {
          isUserTypingRef.current = true;
          setInputValue(e.target.value);
        }}
      />

      {/* Sort select */}
      <select
        className="rl-sort-select"
        value={search.sort ?? 'relevance'}
        aria-label="Sort jobs by"
        onChange={(e) =>
          onUpdate({ sort: e.target.value as ListJobsFilters['sort'] })
        }
      >
        <option value="relevance">Relevance</option>
        <option value="posted">Posted</option>
        <option value="deadline">Deadline</option>
      </select>
    </div>
  );
}
