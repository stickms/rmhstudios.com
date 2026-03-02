/**
 * Athora — Map Filters
 *
 * Category and activity filters for the world map.
 */

"use client";

import { useState } from "react";
import type { AthoraRoomCategory } from "@/types/athora";

const CATEGORIES: { value: AthoraRoomCategory; label: string }[] = [
  { value: "GENERAL", label: "General" },
  { value: "TECH", label: "Tech" },
  { value: "DESIGN", label: "Design" },
  { value: "BUSINESS", label: "Business" },
  { value: "HIRING", label: "Hiring" },
  { value: "GAMING", label: "Gaming" },
  { value: "MUSIC", label: "Music" },
  { value: "ART", label: "Art" },
  { value: "EDUCATION", label: "Education" },
  { value: "LOCAL", label: "Local" },
  { value: "SOCIAL", label: "Social" },
];

interface MapFiltersProps {
  filters: {
    categories: AthoraRoomCategory[];
    minPeople: number;
    showEmpty: boolean;
  };
  onChange: (filters: MapFiltersProps["filters"]) => void;
  className?: string;
}

export function MapFilters({ filters, onChange, className }: MapFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleCategory = (cat: AthoraRoomCategory) => {
    const cats = filters.categories.includes(cat)
      ? filters.categories.filter((c) => c !== cat)
      : [...filters.categories, cat];
    onChange({ ...filters, categories: cats });
  };

  return (
    <div className={`${className ?? ""}`}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="bg-gray-900/90 backdrop-blur-sm border border-gray-700 rounded-lg
                   px-4 py-2 text-white text-sm font-medium hover:bg-gray-800
                   transition-colors flex items-center gap-2"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
          />
        </svg>
        Filters
        {filters.categories.length > 0 && (
          <span className="bg-indigo-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center">
            {filters.categories.length}
          </span>
        )}
      </button>

      {isExpanded && (
        <div
          className="mt-2 bg-gray-900/90 backdrop-blur-sm border border-gray-700
                     rounded-lg p-4 w-72 max-h-80 overflow-y-auto"
        >
          {/* Categories */}
          <div className="mb-4">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Categories
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  onClick={() => toggleCategory(cat.value)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    filters.categories.includes(cat.value)
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Activity */}
          <div className="mb-4">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Minimum People
            </h4>
            <input
              type="range"
              min={0}
              max={50}
              value={filters.minPeople}
              onChange={(e) =>
                onChange({
                  ...filters,
                  minPeople: parseInt(e.target.value),
                })
              }
              className="w-full accent-indigo-500"
            />
            <div className="text-xs text-gray-400 mt-1">
              {filters.minPeople === 0
                ? "Any activity"
                : `${filters.minPeople}+ people`}
            </div>
          </div>

          {/* Show empty */}
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.showEmpty}
              onChange={(e) =>
                onChange({ ...filters, showEmpty: e.target.checked })
              }
              className="rounded border-gray-600 bg-gray-800 text-indigo-500
                         focus:ring-indigo-500 focus:ring-offset-0"
            />
            Show empty rooms
          </label>

          {/* Clear */}
          {(filters.categories.length > 0 ||
            filters.minPeople > 0 ||
            !filters.showEmpty) && (
            <button
              onClick={() =>
                onChange({
                  categories: [],
                  minPeople: 0,
                  showEmpty: true,
                })
              }
              className="mt-3 text-xs text-indigo-400 hover:text-indigo-300"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
