import { useRef, useState, useEffect, useCallback } from 'react';
import { Plus, Music4 } from 'lucide-react';
import { useStudioStore } from '@/lib/studio/store';
import { TRACK_COLORS, DEFAULT_TRACK_HEIGHT } from '@/lib/studio/constants';
import { getPixelsPerBeat } from '@/lib/studio/utils/grid';
import { TimeRuler } from './TimeRuler';
import { TrackHeader, AddTrackButton } from './TrackHeader';
import { TrackLane } from './TrackLane';
import { PlayheadCursor } from './PlayheadCursor';

const TRACK_HEADER_WIDTH = 160;
const TRACK_HEADER_WIDTH_MOBILE = 120;

export function ArrangementView({ isMobile = false }: { isMobile?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const lanesRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);
  const [containerHeight, setContainerHeight] = useState(400);
  const { tracks, selectedTrackId, scrollX, scrollY, setScroll, zoomX, setZoom, addTrack } = useStudioStore();

  const headerWidth = isMobile ? TRACK_HEADER_WIDTH_MOBILE : TRACK_HEADER_WIDTH;
  const laneWidth = containerWidth - headerWidth;

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerWidth(entry.contentRect.width);
        setContainerHeight(entry.contentRect.height);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Scroll sync
  const handleScroll = useCallback(() => {
    const el = lanesRef.current;
    if (!el) return;
    setScroll(el.scrollLeft, el.scrollTop);
  }, [setScroll]);

  // Zoom with Ctrl+scroll
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.max(0.1, Math.min(10, zoomX * delta));
        setZoom(newZoom, 1);
      }
    },
    [zoomX, setZoom],
  );

  const handleAddTrack = (type: 'audio' | 'midi') => {
    const id = crypto.randomUUID();
    const colorIdx = tracks.length % TRACK_COLORS.length;
    addTrack({
      id,
      name: type === 'midi' ? `MIDI ${tracks.length + 1}` : `Audio ${tracks.length + 1}`,
      type,
      color: TRACK_COLORS[colorIdx],
      volume: 0.8,
      pan: 0,
      muted: false,
      soloed: false,
      armed: false,
      clipIds: [],
      pluginChain: [],
      sends: [],
      height: DEFAULT_TRACK_HEIGHT,
    });
  };

  // ─── Empty State ──────────────────────────────────────────────────────────
  if (tracks.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-[var(--site-muted)]">
        <Music4 className="h-16 w-16 opacity-20" />
        <div className="text-center">
          <p className="text-sm font-medium text-[var(--site-text)]">No tracks yet</p>
          <p className="mt-1 text-xs">Add a track to start making music</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleAddTrack('midi')}
            className="flex items-center gap-2 rounded-lg bg-cyan-500/20 px-4 py-2 text-sm text-cyan-400 hover:bg-cyan-500/30"
          >
            <Plus className="h-4 w-4" />
            MIDI Track
          </button>
          <button
            onClick={() => handleAddTrack('audio')}
            className="flex items-center gap-2 rounded-lg bg-purple-500/20 px-4 py-2 text-sm text-purple-400 hover:bg-purple-500/30"
          >
            <Plus className="h-4 w-4" />
            Audio Track
          </button>
        </div>
      </div>
    );
  }

  // Calculate total timeline width (minimum 200 bars worth)
  const ppb = getPixelsPerBeat(zoomX);
  const totalBeats = Math.max(200 * 4, ...tracks.flatMap((t) =>
    t.clipIds.map((id) => {
      const clip = useStudioStore.getState().clips[id];
      return clip ? clip.startBeat + clip.durationBeats + 16 : 0;
    }),
  ));
  const totalTimelineWidth = totalBeats * ppb;

  return (
    <div ref={containerRef} className="relative flex h-full flex-col overflow-hidden" onWheel={handleWheel}>
      {/* Time ruler */}
      <TimeRuler width={containerWidth} trackHeaderWidth={headerWidth} />

      {/* Tracks area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Track headers (fixed left column) */}
        <div
          className="flex shrink-0 flex-col overflow-y-auto overflow-x-hidden scrollbar-none"
          style={{ width: headerWidth, marginTop: -scrollY }}
        >
          {tracks.map((track) => (
            <TrackHeader
              key={track.id}
              track={track}
              isSelected={track.id === selectedTrackId}
              width={headerWidth}
            />
          ))}
          <AddTrackButton width={headerWidth} />
        </div>

        {/* Track lanes (scrollable) */}
        <div
          ref={lanesRef}
          className="flex-1 overflow-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10"
          onScroll={handleScroll}
        >
          <div style={{ width: totalTimelineWidth, position: 'relative' }}>
            {tracks.map((track) => (
              <TrackLane
                key={track.id}
                track={track}
                width={laneWidth}
                isSelected={track.id === selectedTrackId}
              />
            ))}

            {/* Add track spacer in lanes area */}
            <div
              className="flex items-center border-b border-[var(--site-border)] bg-black/10"
              style={{ height: 32, width: totalTimelineWidth }}
            />
          </div>

          {/* Playhead overlay */}
          <PlayheadCursor
            width={laneWidth}
            height={containerHeight - 28}
          />
        </div>
      </div>
    </div>
  );
}
