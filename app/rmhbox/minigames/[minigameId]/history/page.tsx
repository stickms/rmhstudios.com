/**
 * Minigame History Page
 *
 * Searchable, sortable, filterable list of game histories for a
 * specific minigame. Supports expandable detail view with
 * minigame-specific game log rendering.
 *
 * Reference: docs/rmhbox/design-spec/core.md §14A.4
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { ChevronDown, ChevronUp, Search, ArrowUpDown, Filter } from 'lucide-react';
import RMHboxHeader from '@/components/rmhbox/RMHboxHeader';
import { MINIGAME_REGISTRY } from '@/lib/rmhbox/minigame-registry';
import { getHistoryDisplay } from '@/lib/rmhbox/history-display-registry';
import type { GameLog } from '@/lib/rmhbox/history-display-registry';

// Ensure history display registrations are loaded
import '@/lib/rmhbox/history-display-registrations';
import { useParams } from '@tanstack/react-router';

interface MatchEntry {
  id: string;
  minigameId: string;
  lobbyId: string;
  startedAt: string;
  endedAt: string | null;
  durationMs: number;
  winnerUserId: string | null;
  playerCount: number;
  players: Array<{
    userId: string;
    userName: string;
    rank: number;
    score: number;
    wasWinner?: boolean;
  }>;
  gameLog?: GameLog;
}

type SortKey = 'date' | 'score' | 'rank' | 'duration';
type SortDir = 'asc' | 'desc';

export default function MinigameHistoryPage() {
  const params = useParams();
  const minigameId = params.minigameId as string;
  const game = MINIGAME_REGISTRY[minigameId];
  const historyConfig = getHistoryDisplay(minigameId);

  const [matches, setMatches] = useState<MatchEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const limit = 20;

  const fetchMatches = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/rmhbox/history?minigame=${encodeURIComponent(minigameId)}&limit=${limit}&offset=${offset}`,
      );
      if (res.ok) {
        const data = await res.json();
        setMatches(data.matches ?? []);
        setTotal(data.total ?? 0);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [minigameId, offset]);

  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  const handleExpand = useCallback(
    (matchId: string) => {
      setExpandedId((prev) => (prev === matchId ? null : matchId));
    },
    [],
  );

  const handleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(key);
        setSortDir(key === 'date' ? 'desc' : 'asc');
      }
    },
    [sortKey],
  );

  // Sort matches client-side
  const sortedMatches = [...matches].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    switch (sortKey) {
      case 'date':
        return dir * (new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
      case 'duration':
        return dir * (a.durationMs - b.durationMs);
      case 'score': {
        const aScore = a.players[0]?.score ?? 0;
        const bScore = b.players[0]?.score ?? 0;
        return dir * (aScore - bScore);
      }
      case 'rank': {
        const aRank = a.players[0]?.rank ?? 99;
        const bRank = b.players[0]?.rank ?? 99;
        return dir * (aRank - bRank);
      }
      default:
        return 0;
    }
  });

  // Filter by search (using minigame searchable fields + player names + date)
  const filteredMatches = useMemo(() => {
    let result = sortedMatches;

    // Text search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((m) => {
        // Always search player names and date
        if (
          m.players.some((p) => p.userName.toLowerCase().includes(q)) ||
          m.startedAt.toLowerCase().includes(q)
        ) {
          return true;
        }
        // Search through minigame-specific searchable fields
        if (m.gameLog && historyConfig) {
          for (const field of historyConfig.searchableFields) {
            const values = field.extract(m.gameLog);
            if (values.some((v) => v.toLowerCase().includes(q))) {
              return true;
            }
          }
        }
        return false;
      });
    }

    // Apply active filters (select-type filterable fields)
    if (historyConfig && Object.keys(activeFilters).length > 0) {
      result = result.filter((m) => {
        if (!m.gameLog) return true;
        for (const [filterKey, filterValue] of Object.entries(activeFilters)) {
          if (!filterValue) continue;
          const field = historyConfig.filterableFields.find((f) => f.key === filterKey);
          if (!field) continue;
          if (field.type === 'select' && field.options) {
            const matchOptions = field.options(m.gameLog);
            if (!matchOptions.includes(filterValue)) return false;
          }
        }
        return true;
      });
    }

    return result;
  }, [sortedMatches, searchQuery, historyConfig, activeFilters]);

  // Compute available filter options from all loaded gameLogs
  const filterOptions = useMemo(() => {
    if (!historyConfig) return {};
    const options: Record<string, string[]> = {};
    for (const field of historyConfig.filterableFields) {
      if (field.type === 'select' && field.options) {
        const allValues = new Set<string>();
        for (const m of matches) {
          if (m.gameLog) {
            for (const val of field.options(m.gameLog)) {
              allValues.add(val);
            }
          }
        }
        options[field.key] = [...allValues].sort();
      }
    }
    return options;
  }, [historyConfig, matches]);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
  };

  const SortButton = ({ label, field }: { label: string; field: SortKey }) => (
    <button
      onClick={() => handleSort(field)}
      className={`flex items-center gap-1 text-xs font-medium transition-colors ${
        sortKey === field ? 'text-(--rmhbox-accent)' : 'text-(--rmhbox-text-muted) hover:text-(--rmhbox-text)'
      }`}
    >
      {label}
      <ArrowUpDown className="h-3 w-3" />
    </button>
  );

  const DetailComponent = historyConfig?.DetailComponent;

  return (
    <div className="flex h-screen flex-col">
      <RMHboxHeader
        context="history"
        backLabel="Minigames"
        backHref="/rmhbox/minigames"
        title={game?.displayName ?? minigameId}
      />

      <div className="flex-1 overflow-y-auto p-4 md:p-8" style={{ scrollbarGutter: 'stable both-edges' }}>
        <div className="max-w-4xl mx-auto">
          {/* Search bar */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-(--rmhbox-text-muted)" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                historyConfig?.searchableFields.length
                  ? `Search by ${historyConfig.searchableFields.map((f) => f.label.toLowerCase()).join(', ')}, players…`
                  : 'Search games...'
              }
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) text-(--rmhbox-text) placeholder:text-(--rmhbox-text-dim) outline-none focus:ring-1 focus:ring-(--rmhbox-accent) text-sm"
              data-testid="history-search"
            />
          </div>

          {/* Sort controls */}
          <div className="flex items-center gap-4 mb-4 px-1">
            <span className="text-xs text-(--rmhbox-text-muted)">Sort by:</span>
            <SortButton label="Date" field="date" />
            <SortButton label="Score" field="score" />
            <SortButton label="Rank" field="rank" />
            <SortButton label="Duration" field="duration" />
          </div>

          {/* Filter controls */}
          {(() => {
            const selectFields = historyConfig?.filterableFields.filter(
              (f) => f.type === 'select' && filterOptions[f.key]?.length,
            );
            if (!selectFields?.length) return null;
            return (
              <div className="flex flex-wrap items-center gap-3 mb-4 px-1" data-testid="history-filters">
                <Filter className="h-3.5 w-3.5 text-(--rmhbox-text-muted)" />
                {selectFields.map((field) => (
                  <select
                    key={field.key}
                    value={activeFilters[field.key] ?? ''}
                    onChange={(e) =>
                      setActiveFilters((prev) => {
                        const next = { ...prev };
                        if (e.target.value) {
                          next[field.key] = e.target.value;
                        } else {
                          delete next[field.key];
                        }
                        return next;
                      })
                    }
                    className="text-xs px-2 py-1.5 rounded-md border border-(--rmhbox-border) bg-(--rmhbox-bg) text-(--rmhbox-text) outline-none focus:ring-1 focus:ring-(--rmhbox-accent)"
                    data-testid={`history-filter-${field.key}`}
                  >
                    <option value="">{field.label}: All</option>
                    {(filterOptions[field.key] ?? []).map((opt) => (
                      <option key={opt} value={opt}>
                        {field.label}: {opt}
                      </option>
                    ))}
                  </select>
                ))}
              </div>
            );
          })()}

          {/* Match list */}
          {loading ? (
            <p className="text-sm text-center py-12 text-(--rmhbox-text-muted)">Loading history…</p>
          ) : filteredMatches.length === 0 ? (
            <p className="text-sm text-center py-12 text-(--rmhbox-text-muted)">
              {searchQuery || Object.keys(activeFilters).length > 0 ? 'No matches found.' : 'No game history yet.'}
            </p>
          ) : (
            <div className="space-y-2">
              {filteredMatches.map((match) => {
                const winner = match.players.find((p) => p.rank === 1);
                const isExpanded = expandedId === match.id;

                return (
                  <div
                    key={match.id}
                    className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-surface) overflow-hidden"
                    data-testid={`history-entry-${match.id}`}
                  >
                    {/* Summary row */}
                    <button
                      onClick={() => handleExpand(match.id)}
                      className="w-full flex items-center gap-4 p-4 text-left hover:bg-(--rmhbox-surface-hover) transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 text-sm">
                          <span className="text-(--rmhbox-text-muted)">{formatDate(match.startedAt)}</span>
                          <span className="text-(--rmhbox-text-muted)">·</span>
                          <span className="text-(--rmhbox-text)">{match.playerCount} players</span>
                          <span className="text-(--rmhbox-text-muted)">·</span>
                          <span className="text-(--rmhbox-text-muted)">{formatDuration(match.durationMs)}</span>
                        </div>
                        {match.gameLog && historyConfig && (
                          <p
                            className="text-sm mt-1 text-(--rmhbox-text) truncate"
                            data-testid={`history-summary-${match.id}`}
                          >
                            {historyConfig.getSummary(match.gameLog)}
                          </p>
                        )}
                        <div className="text-xs mt-1 text-(--rmhbox-text-muted)">
                          Winner:{' '}
                          <span className="text-(--rmhbox-accent) font-medium">
                            {winner?.userName ?? 'None'}
                          </span>
                        </div>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-(--rmhbox-text-muted) shrink-0" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-(--rmhbox-text-muted) shrink-0" />
                      )}
                    </button>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="border-t border-(--rmhbox-border) p-4 bg-(--rmhbox-bg)">
                        {match.gameLog && DetailComponent ? (
                          <DetailComponent
                            gameLog={match.gameLog}
                            currentUserId=""
                            players={match.players}
                          />
                        ) : match.gameLog ? (
                          <pre className="text-xs overflow-auto text-(--rmhbox-text-muted) max-h-64">
                            {JSON.stringify(match.gameLog, null, 2)}
                          </pre>
                        ) : (
                          <p className="text-sm text-center py-4 text-(--rmhbox-text-muted)">
                            Game log not available.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {total > limit && (
            <div className="flex items-center justify-center gap-4 mt-6">
              <button
                onClick={() => setOffset((o) => Math.max(0, o - limit))}
                disabled={offset === 0}
                className="px-4 py-2 text-sm rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-(--rmhbox-surface-hover) text-(--rmhbox-text-muted) hover:text-(--rmhbox-text)"
              >
                Previous
              </button>
              <span className="text-sm text-(--rmhbox-text-muted)">
                {offset + 1}–{Math.min(offset + limit, total)} of {total}
              </span>
              <button
                onClick={() => setOffset((o) => o + limit)}
                disabled={offset + limit >= total}
                className="px-4 py-2 text-sm rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-(--rmhbox-surface-hover) text-(--rmhbox-text-muted) hover:text-(--rmhbox-text)"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
