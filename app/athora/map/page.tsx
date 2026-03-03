/**
 * Athora — World Map Page
 *
 * Entry point for browsing rooms on the world map.
 */

import WorldMapLoader from "./WorldMapLoader";

export const metadata = {
  title: "Athora — World Map",
  description: "Explore spatial networking rooms around the world",
};

export default function AthoraMapPage() {
  return <WorldMapLoader />;
}
