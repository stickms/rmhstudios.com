/**
 * Derive URL paths + census expectations from the canvas route manifest.
 * Shared by the e2e census spec. Param routes ($id) are skipped until the
 * manifest carries fixtures for them.
 */

import { ROUTE_MANIFEST, type RouteManifestEntry } from "../testing/canvas/route-manifest";

export interface CensusRoute {
  file: string;
  url: string;
  overlayAllow: string[];
}

/** file path (relative to app/routes, no .tsx) → URL path. */
function fileToUrl(file: string): string | null {
  let p = file.replace(/\.tsx$/, "");
  if (p.startsWith("_site/")) p = p.slice("_site".length); // "/roadmap"
  else p = "/" + p;
  p = p.replace(/\/index$/, "/").replace(/\/route$/, "");
  if (p === "/index") p = "/";
  // Skip param + splat routes (need fixtures).
  if (/[$]/.test(p)) return null;
  return p === "" ? "/" : p;
}

export function censusRoutes(onlyConverted = true): CensusRoute[] {
  const out: CensusRoute[] = [];
  for (const entry of ROUTE_MANIFEST as RouteManifestEntry[]) {
    if (onlyConverted && !entry.converted) continue;
    const url = fileToUrl(entry.file);
    if (!url) continue;
    out.push({ file: entry.file, url, overlayAllow: entry.overlayAllow ?? [] });
  }
  return out;
}
