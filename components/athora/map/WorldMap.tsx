/**
 * Athora — World Map (MapLibre GL)
 *
 * GPU-accelerated WebGL world map showing rooms as interactive markers.
 * Uses react-map-gl with MapLibre GL for fast, modern rendering.
 */

"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Map, {
  Marker,
  Popup,
  NavigationControl,
  type ViewStateChangeEvent,
  type MapRef,
} from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import Link from "next/link";
import { MapFilters } from "./MapFilters";
import { boundsToQueryParams } from "@/lib/athora/map/geoUtils";
import type {
  MapRoom,
  MapCluster,
  AthoraRoomCategory,
  ViewportBounds,
} from "@/types/athora";

const MAP_STYLE =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

export default function WorldMap() {
  const mapRef = useRef<MapRef>(null);
  const [rooms, setRooms] = useState<MapRoom[]>([]);
  const [clusters, setClusters] = useState<MapCluster[]>([]);
  const [viewType, setViewType] = useState<"rooms" | "clusters">("rooms");
  const [selectedRoom, setSelectedRoom] = useState<MapRoom | null>(null);
  const [zoom, setZoom] = useState(4);
  const debounceRef = useRef<NodeJS.Timeout>(undefined);

  const [filters, setFilters] = useState<{
    categories: AthoraRoomCategory[];
    minPeople: number;
    showEmpty: boolean;
  }>({
    categories: [],
    minPeople: 0,
    showEmpty: true,
  });

  const fetchRooms = useCallback(
    async (bounds: ViewportBounds, currentZoom: number) => {
      const queryStr = boundsToQueryParams(bounds, currentZoom, filters);
      const res = await fetch(`/api/athora/map/rooms?${queryStr}`);
      if (!res.ok) return;

      const data = await res.json();
      if (data.type === "clusters") {
        setClusters(data.clusters);
        setRooms([]);
        setViewType("clusters");
      } else {
        setRooms(data.rooms);
        setClusters([]);
        setViewType("rooms");
      }
    },
    [filters]
  );

  const handleMoveEnd = useCallback(
    (e: ViewStateChangeEvent) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const map = mapRef.current?.getMap();
        if (!map) return;

        const bounds = map.getBounds();
        const currentZoom = Math.round(e.viewState.zoom);
        setZoom(currentZoom);

        fetchRooms(
          {
            north: bounds.getNorth(),
            south: bounds.getSouth(),
            east: bounds.getEast(),
            west: bounds.getWest(),
          },
          currentZoom
        );
      }, 300);
    },
    [fetchRooms]
  );

  // Initial fetch
  useEffect(() => {
    fetchRooms({ north: 90, south: -90, east: 180, west: -180 }, 4);
  }, [fetchRooms]);

  const getMarkerColor = (room: MapRoom): string => {
    if (room.isPinned) return "#f59e0b";
    const intensity = Math.min(room.currentCount / room.capacity, 1);
    if (intensity > 0.7) return "#ef4444";
    if (intensity > 0.3) return "#22c55e";
    return "#6b7280";
  };

  const getMarkerSize = (room: MapRoom): number => {
    const intensity = Math.min(room.currentCount / room.capacity, 1);
    return 12 + intensity * 20;
  };

  return (
    <div className="relative h-screen w-full">
      {/* Filter bar */}
      <MapFilters
        filters={filters}
        onChange={setFilters}
        className="absolute top-4 left-4 z-10"
      />

      {/* Create room button */}
      <Link
        href="/athora/room/create"
        className="absolute bottom-6 right-6 z-10 rounded-full bg-indigo-600
                   px-6 py-3 text-white shadow-lg hover:bg-indigo-700
                   transition-colors font-medium"
      >
        + Create Room
      </Link>

      <Map
        ref={mapRef}
        initialViewState={{
          latitude: 39.2904,
          longitude: -76.6122,
          zoom: 4,
        }}
        style={{ width: "100%", height: "100%" }}
        mapStyle={MAP_STYLE}
        onMoveEnd={handleMoveEnd}
        minZoom={2}
        maxZoom={18}
      >
        <NavigationControl position="bottom-right" />

        {/* City-level clusters */}
        {viewType === "clusters" &&
          clusters.map((cluster, i) => (
            <Marker
              key={`cluster-${i}`}
              latitude={cluster.lat}
              longitude={cluster.lng}
              anchor="center"
            >
              <div
                className="flex items-center justify-center rounded-full bg-indigo-600/80
                           border-2 border-white/60 shadow-lg cursor-pointer
                           hover:bg-indigo-500 transition-colors"
                style={{
                  width: Math.min(20 + cluster.roomCount * 4, 60),
                  height: Math.min(20 + cluster.roomCount * 4, 60),
                }}
              >
                <div className="text-center">
                  <div className="text-white font-bold text-xs">
                    {cluster.roomCount}
                  </div>
                  {cluster.totalPeople > 0 && (
                    <div className="text-white/70 text-[8px]">
                      {cluster.totalPeople}
                    </div>
                  )}
                </div>
              </div>
            </Marker>
          ))}

        {/* Individual room markers */}
        {viewType === "rooms" &&
          rooms.map((room) => {
            const color = getMarkerColor(room);
            const size = getMarkerSize(room);

            return (
              <Marker
                key={room.id}
                latitude={room.latitude}
                longitude={room.longitude}
                anchor="center"
                onClick={(e) => {
                  e.originalEvent.stopPropagation();
                  setSelectedRoom(room);
                }}
              >
                <div
                  className="rounded-full border-2 border-white flex items-center
                             justify-center cursor-pointer transition-transform
                             hover:scale-110"
                  style={{
                    width: size,
                    height: size,
                    backgroundColor: color,
                    boxShadow: `0 0 ${
                      room.currentCount > 0 ? 12 : 0
                    }px ${color}80`,
                  }}
                >
                  {room.currentCount > 0 && (
                    <span
                      className="text-white font-bold"
                      style={{ fontSize: size * 0.35 }}
                    >
                      {room.currentCount}
                    </span>
                  )}
                </div>
              </Marker>
            );
          })}

        {/* Selected room popup */}
        {selectedRoom && (
          <Popup
            latitude={selectedRoom.latitude}
            longitude={selectedRoom.longitude}
            anchor="bottom"
            onClose={() => setSelectedRoom(null)}
            closeOnClick={false}
            className="[&_.maplibregl-popup-content]:!bg-gray-900 [&_.maplibregl-popup-content]:!text-white
                       [&_.maplibregl-popup-content]:!rounded-xl [&_.maplibregl-popup-content]:!p-0
                       [&_.maplibregl-popup-content]:!shadow-2xl [&_.maplibregl-popup-content]:!border
                       [&_.maplibregl-popup-content]:!border-gray-700"
          >
            <div className="w-64 p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold text-lg text-white">
                  {selectedRoom.name}
                </h3>
                {selectedRoom.isPinned && (
                  <span className="text-xs bg-amber-900/50 text-amber-300 px-2 py-0.5 rounded-full">
                    Featured
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ backgroundColor: getMarkerColor(selectedRoom) }}
                />
                {selectedRoom.currentCount}/{selectedRoom.capacity} people
              </div>

              <span className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded-full">
                {selectedRoom.category}
              </span>

              <Link
                href={`/athora/room/${selectedRoom.slug}`}
                className="mt-3 block w-full text-center bg-indigo-600 text-white
                           rounded-lg py-2 text-sm font-medium hover:bg-indigo-700
                           transition-colors"
              >
                Enter Room
              </Link>
            </div>
          </Popup>
        )}
      </Map>
    </div>
  );
}
