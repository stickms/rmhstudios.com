/**
 * Athora — World Map (MapLibre GL)
 *
 * GPU-accelerated WebGL world map showing rooms as interactive markers.
 * Uses react-map-gl with MapLibre GL for fast, modern rendering.
 * Groups nearby rooms into location markers when they overlap.
 * Cluster markers open a room list popup; zooming past threshold
 * animates rooms bursting out from their parent cluster positions.
 */

"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import MapGL, {
  Marker,
  Popup,
  NavigationControl,
  type ViewStateChangeEvent,
  type MapRef,
  type MapLayerMouseEvent,
} from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import Link from "next/link";
import { MapFilters } from "./MapFilters";
import { HeatmapOverlay } from "./HeatmapOverlay";
import { boundsToQueryParams } from "@/lib/athora/map/geoUtils";
import type {
  MapRoom,
  MapCluster,
  AthoraRoomCategory,
  ViewportBounds,
} from "@/types/athora";

const MAP_STYLE =
  "https://tiles.openfreemap.org/styles/dark";

/** Shared popup className — dark theme overrides for MapLibre's default popup */
const POPUP_CLASS = [
  "[&.maplibregl-popup]:!max-w-none",
  "[&_.maplibregl-popup-content]:!bg-gray-900",
  "[&_.maplibregl-popup-content]:!text-white",
  "[&_.maplibregl-popup-content]:!rounded-xl",
  "[&_.maplibregl-popup-content]:!p-0",
  "[&_.maplibregl-popup-content]:!shadow-2xl",
  "[&_.maplibregl-popup-content]:!border",
  "[&_.maplibregl-popup-content]:!border-gray-700",
  "[&_.maplibregl-popup-content]:!max-w-none",
  "[&_.maplibregl-popup-content]:!overflow-hidden",
  "[&_.maplibregl-popup-tip]:!border-t-gray-900",
  "[&_.maplibregl-popup-close-button]:!text-gray-400",
  "[&_.maplibregl-popup-close-button]:!text-xl",
  "[&_.maplibregl-popup-close-button]:!right-2",
  "[&_.maplibregl-popup-close-button]:!top-1",
  "[&_.maplibregl-popup-close-button]:hover:!text-white",
].join(" ");

/** Proximity threshold for grouping rooms (in degrees, ~100m at equator) */
const GROUP_THRESHOLD = 0.001;

const SPLIT_DURATION = 600; // ms for cluster→room split animation

interface RoomGroup {
  lat: number;
  lng: number;
  rooms: MapRoom[];
}

interface SplitAnim {
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  startTime: number;
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Group rooms that are very close together into location groups */
function groupRoomsByLocation(rooms: MapRoom[]): RoomGroup[] {
  const groups: RoomGroup[] = [];

  for (const room of rooms) {
    let added = false;
    for (const group of groups) {
      if (
        Math.abs(room.latitude - group.lat) < GROUP_THRESHOLD &&
        Math.abs(room.longitude - group.lng) < GROUP_THRESHOLD
      ) {
        group.rooms.push(room);
        group.lat =
          group.rooms.reduce((s, r) => s + r.latitude, 0) / group.rooms.length;
        group.lng =
          group.rooms.reduce((s, r) => s + r.longitude, 0) / group.rooms.length;
        added = true;
        break;
      }
    }
    if (!added) {
      groups.push({ lat: room.latitude, lng: room.longitude, rooms: [room] });
    }
  }

  return groups;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function findNearestCluster(
  lat: number,
  lng: number,
  clusters: MapCluster[]
): MapCluster | null {
  if (clusters.length === 0) return null;
  let nearest = clusters[0];
  let minDist = Infinity;
  for (const c of clusters) {
    const d = (c.lat - lat) ** 2 + (c.lng - lng) ** 2;
    if (d < minDist) {
      minDist = d;
      nearest = c;
    }
  }
  return nearest;
}

// ── Shared sub-components ────────────────────────────────────────────

function RoomListItem({
  room,
  getMarkerColor,
  accessButton,
}: {
  room: MapRoom;
  getMarkerColor: (room: MapRoom) => string;
  accessButton: React.ReactNode;
}) {
  return (
    <div className="bg-gray-800/60 rounded-lg p-3 border border-gray-700/50">
      <div className="flex items-center gap-1.5 mb-1">
        <h4 className="text-sm font-semibold text-white truncate">
          {room.name}
        </h4>
        {room.isPinned && (
          <span className="text-[9px] bg-amber-900/50 text-amber-300 px-1.5 py-0.5 rounded-full shrink-0">
            Featured
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5 text-[11px] text-gray-400 mb-2">
        <span
          className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
          style={{ backgroundColor: getMarkerColor(room) }}
        />
        {room.currentCount}/{room.capacity}
        <span className="text-gray-600">&middot;</span>
        <span className="text-gray-500">{room.category}</span>
        <span className="text-gray-600">&middot;</span>
        <span
          className={
            room.accessType === "PUBLIC"
              ? "text-green-400"
              : room.accessType === "PRIVATE"
              ? "text-yellow-400"
              : "text-red-400"
          }
        >
          {room.accessType === "PUBLIC"
            ? "Public"
            : room.accessType === "PRIVATE"
            ? "Request"
            : room.accessType === "INVITE_ONLY"
            ? "Invite"
            : "Ticket"}
        </span>
      </div>
      <div>{accessButton}</div>
    </div>
  );
}

function SingleRoomPopup({
  room,
  getMarkerColor,
  accessButton,
}: {
  room: MapRoom;
  getMarkerColor: (room: MapRoom) => string;
  accessButton: React.ReactNode;
}) {
  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-bold text-lg text-white truncate mr-2">
          {room.name}
        </h3>
        {room.isPinned && (
          <span className="text-xs bg-amber-900/50 text-amber-300 px-2 py-0.5 rounded-full shrink-0">
            Featured
          </span>
        )}
      </div>

      {room.description && (
        <p className="text-xs text-gray-400 mb-2 line-clamp-2">
          {room.description}
        </p>
      )}

      <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
        <span
          className="inline-block w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: getMarkerColor(room) }}
        />
        {room.currentCount}/{room.capacity} people
      </div>

      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded-full">
          {room.category}
        </span>
        <span
          className={`text-xs px-2 py-0.5 rounded-full ${
            room.accessType === "PUBLIC"
              ? "bg-green-900/50 text-green-300"
              : room.accessType === "PRIVATE"
              ? "bg-yellow-900/50 text-yellow-300"
              : "bg-red-900/50 text-red-300"
          }`}
        >
          {room.accessType === "PUBLIC"
            ? "Public"
            : room.accessType === "PRIVATE"
            ? "Request Only"
            : room.accessType === "INVITE_ONLY"
            ? "Invite Only"
            : "Event Ticket"}
        </span>
      </div>

      {room.owner?.name && (
        <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-3">
          {room.owner.image && (
            <img
              src={room.owner.image}
              alt=""
              className="w-4 h-4 rounded-full"
            />
          )}
          Hosted by {room.owner.name}
        </div>
      )}

      {accessButton}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────

export default function WorldMap() {
  const mapRef = useRef<MapRef>(null);
  const [rooms, setRooms] = useState<MapRoom[]>([]);
  const [clusters, setClusters] = useState<MapCluster[]>([]);
  const [viewType, setViewType] = useState<"rooms" | "clusters">("rooms");
  const [selectedGroup, setSelectedGroup] = useState<RoomGroup | null>(null);
  const [zoom, setZoom] = useState(4);
  const debounceRef = useRef<NodeJS.Timeout>(undefined);
  const lastBoundsRef = useRef<ViewportBounds>({
    north: 90,
    south: -90,
    east: 180,
    west: -180,
  });
  const lastZoomRef = useRef(4);

  // Flag to prevent map click from overriding marker click
  const markerClickedRef = useRef(false);

  const [newPin, setNewPin] = useState<{ lat: number; lng: number } | null>(
    null
  );

  // Cluster popup state (on-demand room list)
  const [clusterPopup, setClusterPopup] = useState<{
    cluster: MapCluster;
    rooms: MapRoom[];
    loading: boolean;
  } | null>(null);

  // Split animation state
  const prevClustersRef = useRef<MapCluster[]>([]);
  const prevViewTypeRef = useRef<"rooms" | "clusters">("rooms");
  const animatingRoomsRef = useRef<Map<string, SplitAnim>>(new Map());
  const animFrameRef = useRef(0);
  const [animTick, setAnimTick] = useState(0);

  const [showHeatmap, setShowHeatmap] = useState(false);

  const [filters, setFilters] = useState<{
    categories: AthoraRoomCategory[];
    minPeople: number;
    showEmpty: boolean;
  }>({
    categories: [],
    minPeople: 0,
    showEmpty: true,
  });

  // ── Split animation logic ────────────────────────────────────────

  const startSplitAnimation = useCallback(
    (newRooms: MapRoom[], previousClusters: MapCluster[]) => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }

      const animMap = new Map<string, SplitAnim>();
      const now = performance.now();

      for (const room of newRooms) {
        const cluster = findNearestCluster(
          room.latitude,
          room.longitude,
          previousClusters
        );
        if (cluster) {
          animMap.set(room.id, {
            fromLat: cluster.lat,
            fromLng: cluster.lng,
            toLat: room.latitude,
            toLng: room.longitude,
            // Stagger start times for a popcorn burst effect
            startTime: now + Math.random() * 150,
          });
        }
      }

      animatingRoomsRef.current = animMap;

      const tick = () => {
        const currentTime = performance.now();
        let anyActive = false;

        for (const [id, anim] of animatingRoomsRef.current) {
          const elapsed = currentTime - anim.startTime;
          if (elapsed >= SPLIT_DURATION) {
            animatingRoomsRef.current.delete(id);
          } else {
            anyActive = true;
          }
        }

        setAnimTick((t) => t + 1);

        if (anyActive) {
          animFrameRef.current = requestAnimationFrame(tick);
        } else {
          animatingRoomsRef.current = new Map();
          animFrameRef.current = 0;
        }
      };

      animFrameRef.current = requestAnimationFrame(tick);
    },
    []
  );

  const getGroupAnimatedPosition = useCallback(
    (group: RoomGroup): { lat: number; lng: number } => {
      for (const room of group.rooms) {
        const anim = animatingRoomsRef.current.get(room.id);
        if (anim) {
          const elapsed = performance.now() - anim.startTime;
          if (elapsed < 0) {
            // Stagger hasn't started yet — stay at cluster origin
            return { lat: anim.fromLat, lng: anim.fromLng };
          }
          const rawProgress = Math.min(elapsed / SPLIT_DURATION, 1);
          const progress = easeOutCubic(rawProgress);
          return {
            lat: anim.fromLat + (group.lat - anim.fromLat) * progress,
            lng: anim.fromLng + (group.lng - anim.fromLng) * progress,
          };
        }
      }
      return { lat: group.lat, lng: group.lng };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [animTick]
  );

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  // ── Data fetching ────────────────────────────────────────────────

  const fetchRooms = useCallback(
    async (bounds: ViewportBounds, currentZoom: number) => {
      const queryStr = boundsToQueryParams(bounds, currentZoom, filters);
      const res = await fetch(`/api/athora/map/rooms?${queryStr}`);
      if (!res.ok) return;

      const data = await res.json();

      if (data.type === "clusters") {
        // Cancel any running split animation
        if (animFrameRef.current) {
          cancelAnimationFrame(animFrameRef.current);
          animFrameRef.current = 0;
          animatingRoomsRef.current = new Map();
        }
        prevClustersRef.current = data.clusters;
        setClusters(data.clusters);
        setRooms([]);
        setViewType("clusters");
        setClusterPopup(null);
      } else {
        const wasClusters = prevViewTypeRef.current === "clusters";
        const previousClusters = prevClustersRef.current;

        setRooms(data.rooms);
        setClusters([]);
        setViewType("rooms");
        setClusterPopup(null);

        // Trigger split animation on cluster→room transition
        if (wasClusters && previousClusters.length > 0) {
          startSplitAnimation(data.rooms, previousClusters);
        }
      }

      prevViewTypeRef.current = data.type;
    },
    [filters, startSplitAnimation]
  );

  // Fetch rooms for a cluster on-demand
  const fetchClusterRooms = useCallback(
    async (cluster: MapCluster) => {
      setClusterPopup({ cluster, rooms: [], loading: true });

      const BBOX_PAD = 0.5;
      const bounds: ViewportBounds = {
        north: cluster.lat + BBOX_PAD,
        south: cluster.lat - BBOX_PAD,
        east: cluster.lng + BBOX_PAD,
        west: cluster.lng - BBOX_PAD,
      };

      // zoom=10 forces the API to return individual rooms, not clusters
      const queryStr = boundsToQueryParams(bounds, 10, filters);
      try {
        const res = await fetch(`/api/athora/map/rooms?${queryStr}`);
        if (!res.ok) throw new Error("fetch failed");
        const data = await res.json();

        if (data.type === "rooms") {
          setClusterPopup((prev) =>
            prev ? { ...prev, rooms: data.rooms, loading: false } : null
          );
        }
      } catch {
        setClusterPopup(null);
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

        const vb: ViewportBounds = {
          north: bounds.getNorth(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          west: bounds.getWest(),
        };
        lastBoundsRef.current = vb;
        lastZoomRef.current = currentZoom;

        fetchRooms(vb, currentZoom);
      }, 300);
    },
    [fetchRooms]
  );

  // Re-fetch when filters change using the current viewport
  useEffect(() => {
    fetchRooms(lastBoundsRef.current, lastZoomRef.current);
  }, [fetchRooms]);

  // Group rooms by proximity
  const roomGroups = useMemo(() => groupRoomsByLocation(rooms), [rooms]);

  // ── Marker helpers ───────────────────────────────────────────────

  const getMarkerColor = (room: MapRoom): string => {
    if (room.isPinned) return "#f59e0b";
    const intensity = Math.min(room.currentCount / room.capacity, 1);
    if (intensity > 0.7) return "#ef4444";
    if (intensity > 0.3) return "#22c55e";
    return "#6b7280";
  };

  const getGroupColor = (group: RoomGroup): string => {
    const best = group.rooms.reduce((a, b) =>
      b.currentCount / b.capacity > a.currentCount / a.capacity ? b : a
    );
    return getMarkerColor(best);
  };

  const getGroupSize = (group: RoomGroup): number => {
    const totalPeople = group.rooms.reduce((s, r) => s + r.currentCount, 0);
    const totalCapacity = group.rooms.reduce((s, r) => s + r.capacity, 0);
    const intensity = Math.min(totalPeople / totalCapacity, 1);
    return Math.max(44, 28 + intensity * 16 + Math.min(group.rooms.length - 1, 4) * 4);
  };

  const getAccessButton = (room: MapRoom) => {
    if (room.accessType === "PUBLIC") {
      return (
        <Link
          href={`/athora/room/${room.id}`}
          className="block w-full text-center px-3 py-1.5 text-xs text-white bg-indigo-600 rounded-md font-medium hover:bg-indigo-700 transition-colors"
        >
          Join Room
        </Link>
      );
    }
    if (room.accessType === "PRIVATE") {
      return (
        <Link
          href={`/athora/room/${room.id}`}
          className="block w-full text-center px-3 py-1.5 text-xs text-white bg-yellow-600 rounded-md font-medium hover:bg-yellow-700 transition-colors"
        >
          Request to Join
        </Link>
      );
    }
    return (
      <span className="block w-full text-center px-3 py-1.5 text-xs text-gray-500 bg-gray-800 rounded-md cursor-not-allowed">
        {room.accessType === "INVITE_ONLY" ? "Invite Only" : "Requires Ticket"}
      </span>
    );
  };

  const getFullAccessButton = (room: MapRoom) => {
    if (room.accessType === "PUBLIC") {
      return (
        <Link
          href={`/athora/room/${room.id}`}
          className="block w-full text-center bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          Join Room
        </Link>
      );
    }
    if (room.accessType === "PRIVATE") {
      return (
        <Link
          href={`/athora/room/${room.id}`}
          className="block w-full text-center bg-yellow-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-yellow-700 transition-colors"
        >
          Request to Join
        </Link>
      );
    }
    return (
      <button
        disabled
        className="block w-full text-center bg-gray-700 text-gray-400 rounded-lg py-2 text-sm font-medium cursor-not-allowed"
      >
        {room.accessType === "INVITE_ONLY" ? "Invite Only" : "Requires Ticket"}
      </button>
    );
  };

  // ── Click handlers ───────────────────────────────────────────────

  const handleMarkerClick = useCallback((group: RoomGroup) => {
    markerClickedRef.current = true;
    setNewPin(null);
    setClusterPopup(null);
    setSelectedGroup(group);
    setTimeout(() => {
      markerClickedRef.current = false;
    }, 100);
  }, []);

  const handleClusterClick = useCallback(
    (cluster: MapCluster) => {
      markerClickedRef.current = true;
      setNewPin(null);
      setSelectedGroup(null);
      fetchClusterRooms(cluster);
      setTimeout(() => {
        markerClickedRef.current = false;
      }, 100);
    },
    [fetchClusterRooms]
  );

  const handleMapClick = useCallback((e: MapLayerMouseEvent) => {
    if (markerClickedRef.current) return;
    setSelectedGroup(null);
    setClusterPopup(null);
    setNewPin({ lat: e.lngLat.lat, lng: e.lngLat.lng });
  }, []);

  // ── Render ───────────────────────────────────────────────────────

  return (
    <div className="relative h-screen w-full">
      {/* Filter bar */}
      <MapFilters
        filters={filters}
        onChange={setFilters}
        className="absolute top-4 left-4 z-10"
      />

      {/* Heatmap toggle */}
      <button
        onClick={() => setShowHeatmap((v) => !v)}
        className={`absolute top-4 right-14 z-10 px-3 py-1.5 rounded-lg text-xs font-medium
                    border transition-colors ${
                      showHeatmap
                        ? "bg-indigo-600 border-indigo-500 text-white"
                        : "bg-gray-900/80 backdrop-blur-sm border-gray-700 text-gray-300 hover:text-white"
                    }`}
      >
        Heatmap
      </button>

      {/* Hint */}
      {!newPin && !selectedGroup && !clusterPopup && (
        <div
          className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10
                        bg-gray-900/80 backdrop-blur-sm border border-gray-700
                        rounded-full px-5 py-2.5 text-gray-300 text-sm
                        pointer-events-none select-none"
        >
          Click anywhere on the map to place a room
        </div>
      )}

      <MapGL
        ref={mapRef}
        initialViewState={{
          latitude: 39.2904,
          longitude: -76.6122,
          zoom: 4,
        }}
        style={{ width: "100%", height: "100%" }}
        mapStyle={MAP_STYLE}
        onMoveEnd={handleMoveEnd}
        onClick={handleMapClick}
        minZoom={2}
        maxZoom={18}
      >
        <NavigationControl position="bottom-right" />

        {/* Activity heatmap layer */}
        {showHeatmap && <HeatmapOverlay />}

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
                onClick={(e) => {
                  e.stopPropagation();
                  handleClusterClick(cluster);
                }}
                className="flex flex-col items-center justify-center rounded-full bg-indigo-600/90
                           border-2 border-white/60 shadow-lg cursor-pointer
                           hover:bg-indigo-500 transition-all hover:scale-110"
                style={{
                  width: Math.max(48, Math.min(32 + cluster.roomCount * 5, 72)),
                  height: Math.max(48, Math.min(32 + cluster.roomCount * 5, 72)),
                }}
              >
                <div className="flex items-center gap-0.5">
                  <svg className="w-2.5 h-2.5 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3" />
                  </svg>
                  <span className="text-white font-bold text-xs">
                    {cluster.roomCount}
                  </span>
                </div>
                <div className="flex items-center gap-0.5">
                  <svg className="w-2.5 h-2.5 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span className="text-white/70 font-medium text-[10px]">
                    {cluster.totalPeople}
                  </span>
                </div>
              </div>
            </Marker>
          ))}

        {/* Room group markers */}
        {viewType === "rooms" &&
          roomGroups.map((group, i) => {
            const color = getGroupColor(group);
            const size = getGroupSize(group);
            const totalPeople = group.rooms.reduce(
              (s, r) => s + r.currentCount,
              0
            );
            const isSingle = group.rooms.length === 1;
            const pos = getGroupAnimatedPosition(group);

            return (
              <Marker
                key={`group-${i}`}
                latitude={pos.lat}
                longitude={pos.lng}
                anchor="center"
              >
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    handleMarkerClick(group);
                  }}
                  className="rounded-full border-2 border-white flex flex-col items-center
                             justify-center cursor-pointer transition-transform
                             hover:scale-110"
                  style={{
                    width: size,
                    height: size,
                    backgroundColor: color,
                    boxShadow: `0 0 ${totalPeople > 0 ? 12 : 0}px ${color}80`,
                  }}
                >
                  {isSingle ? (
                    <>
                      <div className="flex items-center gap-0.5">
                        <svg className="w-2.5 h-2.5 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3" />
                        </svg>
                        <span className="text-white font-bold text-[10px]">1</span>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <svg className="w-2.5 h-2.5 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        <span className="text-white/80 font-medium text-[10px]">{totalPeople}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-0.5">
                        <svg className="w-2.5 h-2.5 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3" />
                        </svg>
                        <span className="text-white font-bold text-[10px]">{group.rooms.length}</span>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <svg className="w-2.5 h-2.5 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        <span className="text-white/80 font-medium text-[10px]">{totalPeople}</span>
                      </div>
                    </>
                  )}
                </div>
              </Marker>
            );
          })}

        {/* New pin marker */}
        {newPin && (
          <>
            <Marker
              latitude={newPin.lat}
              longitude={newPin.lng}
              anchor="bottom"
            >
              <div className="flex flex-col items-center animate-bounce">
                <div className="w-6 h-6 rounded-full bg-indigo-500 border-2 border-white shadow-lg" />
                <div className="w-0.5 h-3 bg-indigo-500" />
              </div>
            </Marker>
            <Popup
              latitude={newPin.lat}
              longitude={newPin.lng}
              anchor="bottom"
              offset={[0, -40] as [number, number]}
              onClose={() => setNewPin(null)}
              closeOnClick={false}
              className={POPUP_CLASS}
            >
              <div className="w-56 p-4">
                <p className="text-xs text-gray-400 mb-1">
                  {newPin.lat.toFixed(4)}, {newPin.lng.toFixed(4)}
                </p>
                <Link
                  href={`/athora/room/create?lat=${newPin.lat}&lng=${newPin.lng}`}
                  className="mt-2 block w-full text-center bg-indigo-600 text-white
                             rounded-lg py-2 text-sm font-medium hover:bg-indigo-700
                             transition-colors"
                >
                  + Create Room Here
                </Link>
                <button
                  onClick={() => setNewPin(null)}
                  className="mt-1.5 block w-full text-center text-gray-400 text-xs
                             hover:text-white transition-colors py-1"
                >
                  Cancel
                </button>
              </div>
            </Popup>
          </>
        )}

        {/* Selected group popup */}
        {selectedGroup && (
          <Popup
            latitude={selectedGroup.lat}
            longitude={selectedGroup.lng}
            anchor="bottom"
            offset={[0, -10] as [number, number]}
            onClose={() => setSelectedGroup(null)}
            closeOnClick={false}
            className={POPUP_CLASS}
          >
            <div className="w-80 max-h-96 overflow-y-auto">
              {selectedGroup.rooms.length === 1 ? (
                <SingleRoomPopup
                  room={selectedGroup.rooms[0]}
                  getMarkerColor={getMarkerColor}
                  accessButton={getFullAccessButton(selectedGroup.rooms[0])}
                />
              ) : (
                <div className="p-3">
                  <div className="text-xs text-gray-400 mb-2 font-medium">
                    {selectedGroup.rooms.length} rooms at this location
                  </div>
                  <div className="space-y-2">
                    {selectedGroup.rooms.map((room) => (
                      <RoomListItem
                        key={room.id}
                        room={room}
                        getMarkerColor={getMarkerColor}
                        accessButton={getAccessButton(room)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Popup>
        )}

        {/* Cluster room list popup */}
        {clusterPopup && (
          <Popup
            latitude={clusterPopup.cluster.lat}
            longitude={clusterPopup.cluster.lng}
            anchor="bottom"
            offset={[0, -10] as [number, number]}
            onClose={() => setClusterPopup(null)}
            closeOnClick={false}
            className={POPUP_CLASS}
          >
            <div className="w-80 max-h-96 overflow-y-auto">
              <div className="p-3">
                <div className="text-xs text-gray-400 mb-2 font-medium">
                  {clusterPopup.cluster.city ?? "Area"}
                  {clusterPopup.cluster.country
                    ? `, ${clusterPopup.cluster.country}`
                    : ""}{" "}
                  &mdash; {clusterPopup.cluster.roomCount} rooms
                </div>

                {clusterPopup.loading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    <span className="ml-2 text-sm text-gray-400">
                      Loading rooms...
                    </span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {clusterPopup.rooms.map((room) => (
                      <RoomListItem
                        key={room.id}
                        room={room}
                        getMarkerColor={getMarkerColor}
                        accessButton={getAccessButton(room)}
                      />
                    ))}
                    {clusterPopup.rooms.length === 0 && (
                      <p className="text-xs text-gray-500 text-center py-4">
                        No rooms found
                      </p>
                    )}
                  </div>
                )}

                {!clusterPopup.loading && (
                  <button
                    onClick={() => {
                      mapRef.current?.flyTo({
                        center: [
                          clusterPopup.cluster.lng,
                          clusterPopup.cluster.lat,
                        ],
                        zoom: Math.min((lastZoomRef.current || 4) + 3, 14),
                        duration: 800,
                      });
                      setClusterPopup(null);
                    }}
                    className="mt-3 w-full text-center text-xs text-indigo-400 hover:text-indigo-300 transition-colors py-1"
                  >
                    Zoom in to map view
                  </button>
                )}
              </div>
            </div>
          </Popup>
        )}
      </MapGL>
    </div>
  );
}
