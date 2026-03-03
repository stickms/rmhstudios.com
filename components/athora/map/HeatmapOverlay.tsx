/**
 * Athora — Heatmap Overlay
 *
 * MapLibre heatmap layer showing room activity density.
 * Fetches from /api/athora/map/heatmap and renders as a colored overlay.
 */

"use client";

import { useEffect, useState } from "react";
import { Source, Layer } from "react-map-gl/maplibre";

interface HeatmapPoint {
  latitude: number;
  longitude: number;
  intensity: number;
}

export function HeatmapOverlay() {
  const [points, setPoints] = useState<HeatmapPoint[]>([]);

  useEffect(() => {
    async function fetchHeatmap() {
      try {
        const res = await fetch("/api/athora/map/heatmap");
        if (res.ok) {
          const data = await res.json();
          setPoints(data.points || []);
        }
      } catch {
        // silently fail
      }
    }
    fetchHeatmap();

    // Refresh every 30 seconds
    const interval = setInterval(fetchHeatmap, 30000);
    return () => clearInterval(interval);
  }, []);

  if (points.length === 0) return null;

  const geojson: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: points.map((p) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [p.longitude, p.latitude],
      },
      properties: {
        intensity: p.intensity,
      },
    })),
  };

  return (
    <Source id="heatmap-source" type="geojson" data={geojson}>
      <Layer
        id="heatmap-layer"
        type="heatmap"
        paint={{
          "heatmap-weight": ["interpolate", ["linear"], ["get", "intensity"], 0, 0, 50, 1],
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 1, 15, 3],
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0, "rgba(0,0,0,0)",
            0.2, "rgba(99,102,241,0.3)",
            0.4, "rgba(129,140,248,0.5)",
            0.6, "rgba(245,158,11,0.6)",
            0.8, "rgba(239,68,68,0.7)",
            1, "rgba(239,68,68,0.9)",
          ],
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 20, 15, 40],
          "heatmap-opacity": 0.7,
        }}
      />
    </Source>
  );
}
