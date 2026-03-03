"use client";

import dynamic from "next/dynamic";

const WorldMap = dynamic(
  () => import("@/components/athora/map/WorldMap"),
  { ssr: false }
);

export default function WorldMapLoader() {
  return <WorldMap />;
}
