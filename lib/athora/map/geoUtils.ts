/**
 * Athora — Map Geo Utilities
 *
 * Helper functions for viewport bounds queries and clustering.
 */

import type { ViewportBounds } from "@/types/athora";

/** Convert a map viewport event into ViewportBounds */
export function getViewportBounds(
  bounds: [[number, number], [number, number]]
): ViewportBounds {
  return {
    south: bounds[0][1],
    west: bounds[0][0],
    north: bounds[1][1],
    east: bounds[1][0],
  };
}

/** Build query string from viewport bounds */
export function boundsToQueryParams(
  bounds: ViewportBounds,
  zoom: number,
  filters?: {
    categories?: string[];
    minPeople?: number;
    showEmpty?: boolean;
  }
): string {
  const params = new URLSearchParams({
    north: bounds.north.toString(),
    south: bounds.south.toString(),
    east: bounds.east.toString(),
    west: bounds.west.toString(),
    zoom: zoom.toString(),
  });

  if (filters?.categories?.length) {
    params.set("categories", filters.categories.join(","));
  }
  if (filters?.minPeople && filters.minPeople > 0) {
    params.set("minPeople", filters.minPeople.toString());
  }
  if (filters?.showEmpty === false) {
    params.set("hideEmpty", "true");
  }

  return params.toString();
}
