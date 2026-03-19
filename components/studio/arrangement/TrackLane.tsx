import { useRef, useEffect, useCallback } from 'react';
import { useStudioStore } from '@/lib/studio/store';
import { getPixelsPerBeat, snapToGrid, pixelToBeat } from '@/lib/studio/utils/grid';
import type { Track, Clip, MidiClipData } from '@/lib/studio/types';

interface TrackLaneProps {
  track: Track;
  width: number;
  isSelected: boolean;
}

export function TrackLane({ track, width, isSelected }: TrackLaneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { clips, zoomX, scrollX, timeSignature, selectedClipIds, selectedTool, snapEnabled, snapValue } = useStudioStore();

  const trackClips = track.clipIds.map((id) => clips[id]).filter(Boolean);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const h = track.height;
    const safeWidth = Math.min(width, 4096);
    canvas.width = safeWidth * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${safeWidth}px`;
    canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);

    const ppb = getPixelsPerBeat(zoomX);
    const beatsPerBar = timeSignature[0];

    // Background
    ctx.fillStyle = isSelected ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.15)';
    ctx.fillRect(0, 0, safeWidth, h);

    // Grid lines
    const startBeat = scrollX / ppb;
    const endBeat = (scrollX + safeWidth) / ppb;
    const firstBar = Math.floor(startBeat / beatsPerBar) * beatsPerBar;

    for (let beat = firstBar; beat <= endBeat; beat += 1) {
      const x = beat * ppb - scrollX;
      if (x < 0) continue;
      const isBar = Math.abs(beat % beatsPerBar) < 0.001;
      ctx.strokeStyle = isBar ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    // Draw clips
    for (const clip of trackClips) {
      drawClip(ctx, clip, ppb, scrollX, h);
    }

    // Bottom border
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h - 0.5);
    ctx.lineTo(safeWidth, h - 0.5);
    ctx.stroke();
  }, [width, track.height, trackClips, zoomX, scrollX, timeSignature, isSelected]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Handle click to add clip (draw tool) or select
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const store = useStudioStore.getState();
    const ppb = getPixelsPerBeat(zoomX);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const clickX = e.clientX - rect.left;
    const clickBeat = pixelToBeat(clickX, ppb, scrollX);

    // Check if clicking on an existing clip
    const clickedClip = trackClips.find((c) => {
      return clickBeat >= c.startBeat && clickBeat <= c.startBeat + c.durationBeats;
    });

    if (clickedClip) {
      // Select the clip
      const isMultiSelect = e.shiftKey;
      if (isMultiSelect) {
        store.selectClips([...store.selectedClipIds, clickedClip.id]);
      } else {
        store.selectClips([clickedClip.id]);
      }

      // Double-click: open MIDI clip in piano roll
      if (e.detail === 2 && clickedClip.type === 'midi') {
        store.setPianoRollClip(clickedClip.id);
        store.setActiveView('pianoRoll');
      }
      return;
    }

    if (store.selectedTool === 'draw') {
      // Create a new clip at the clicked position
      const snappedBeat = snapToGrid(clickBeat, snapValue, snapEnabled);
      const newClip: Clip = track.type === 'midi'
        ? {
            id: crypto.randomUUID(),
            trackId: track.id,
            type: 'midi',
            name: 'New Pattern',
            startBeat: snappedBeat,
            durationBeats: timeSignature[0], // 1 bar
            color: track.color,
            notes: [],
          }
        : {
            id: crypto.randomUUID(),
            trackId: track.id,
            type: 'audio',
            name: 'New Clip',
            startBeat: snappedBeat,
            durationBeats: timeSignature[0],
            color: track.color,
            bufferId: '',
            sampleOffset: 0,
            fadeInBeats: 0,
            fadeOutBeats: 0,
          };
      store.addClip(newClip);
      store.selectClips([newClip.id]);
    } else {
      // Deselect
      store.selectClips([]);
    }
  };

  return (
    <div style={{ height: track.height }}>
      <canvas
        ref={canvasRef}
        className="sticky left-0 cursor-crosshair"
        style={{ height: track.height, width }}
        onMouseDown={handleMouseDown}
      />
    </div>
  );
}

// ─── Clip Rendering ─────────────────────────────────────────────────────────

function drawClip(
  ctx: CanvasRenderingContext2D,
  clip: Clip,
  ppb: number,
  scrollX: number,
  trackHeight: number,
) {
  const x = clip.startBeat * ppb - scrollX;
  const w = clip.durationBeats * ppb;
  const padding = 2;
  const h = trackHeight - padding * 2;
  const y = padding;
  const radius = 3;

  if (x + w < 0 || x > ctx.canvas.clientWidth) return; // Off-screen

  const selected = useStudioStore.getState().selectedClipIds.includes(clip.id);

  // Clip body
  ctx.fillStyle = clip.color + '40'; // 25% opacity
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fill();

  // Clip border
  ctx.strokeStyle = selected ? '#fff' : clip.color + '80';
  ctx.lineWidth = selected ? 1.5 : 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.stroke();

  // Clip header
  ctx.fillStyle = clip.color + '60';
  ctx.beginPath();
  ctx.roundRect(x, y, w, 14, [radius, radius, 0, 0]);
  ctx.fill();

  // Clip name
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = '9px system-ui, sans-serif';
  ctx.fillText(clip.name, x + 4, y + 10, w - 8);

  // MIDI preview (simplified)
  if (clip.type === 'midi' && (clip as MidiClipData).notes.length > 0) {
    const midiClip = clip as MidiClipData;
    const noteArea = { x: x + 1, y: y + 15, w: w - 2, h: h - 16 };

    if (noteArea.h > 4 && noteArea.w > 4) {
      const pitches = midiClip.notes.map((n) => n.pitch);
      const minPitch = Math.min(...pitches);
      const maxPitch = Math.max(...pitches);
      const pitchRange = Math.max(maxPitch - minPitch, 1);

      ctx.fillStyle = clip.color + 'aa';
      for (const note of midiClip.notes) {
        const nx = noteArea.x + (note.startBeat / clip.durationBeats) * noteArea.w;
        const nw = Math.max((note.durationBeats / clip.durationBeats) * noteArea.w, 1);
        const ny = noteArea.y + noteArea.h - ((note.pitch - minPitch) / pitchRange) * noteArea.h;
        const nh = Math.max(noteArea.h / pitchRange, 1);
        ctx.fillRect(nx, ny, nw, Math.min(nh, 3));
      }
    }
  }
}
