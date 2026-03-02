/**
 * Athora — World Map Page
 *
 * Entry point for browsing rooms on the world map.
 */

import dynamic from "next/dynamic";

// MapLibre GL requires browser APIs, so we lazy-load with no SSR
const WorldMap = dynamic(
  () => import("@/components/athora/map/WorldMap"),
  { ssr: false }
);

export const metadata = {
  title: "Athora — World Map",
  description: "Explore spatial networking rooms around the world",
};

export default function AthoraMapPage() {
  return <WorldMap />;
}
