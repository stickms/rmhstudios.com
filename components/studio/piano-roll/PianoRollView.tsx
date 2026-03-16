import { useRef, useState, useEffect, useCallback } from 'react';
import { useStudioStore } from '@/lib/studio/store';
import { NOTE_NAMES, MIN_MIDI_NOTE, MAX_MIDI_NOTE, NOTE_HEIGHT, PIANO_KEY_WIDTH } from '@/lib/studio/constants';
import { getPixelsPerBeat, snapToGrid, pixelToBeat } from '@/lib/studio/utils/grid';
import type { MidiNote, MidiClipData } from '@/lib/studio/types';

const TOTAL_NOTES = MAX_MIDI_NOTE - MIN_MIDI_NOTE + 1;
const VELOCITY_LANE_HEIGHT = 48;

export function PianoRollView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const velocityRef = useRef<HTMLCanvasElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);
  const [containerHeight, setContainerHeight] = useState(400);

  const {
    pianoRollClipId, clips, zoomX, scrollX, scrollY, setScroll,
    selectedTool, snapEnabled, snapValue, timeSignature, updateClip,
  } = useStudioStore();

  const clip = pianoRollClipId ? (clips[pianoRollClipId] as MidiClipData | undefined) : undefined;

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) { setContainerWidth(r.width); setContainerHeight(r.height); }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Draw note grid
  const drawGrid = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !clip) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = containerWidth - PIANO_KEY_WIDTH;
    const h = TOTAL_NOTES * NOTE_HEIGHT;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);

    const ppb = getPixelsPerBeat(zoomX);

    // Background
    ctx.fillStyle = '#0d0d1a';
    ctx.fillRect(0, 0, w, h);

    // Note rows — alternate white/black key shading
    for (let note = MIN_MIDI_NOTE; note <= MAX_MIDI_NOTE; note++) {
      const y = (MAX_MIDI_NOTE - note) * NOTE_HEIGHT;
      const noteName = NOTE_NAMES[note % 12];
      const isBlack = noteName.includes('#');

      ctx.fillStyle = isBlack ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.02)';
      ctx.fillRect(0, y, w, NOTE_HEIGHT);

      // Row border
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y + NOTE_HEIGHT);
      ctx.lineTo(w, y + NOTE_HEIGHT);
      ctx.stroke();

      // C note highlight
      if (noteName === 'C') {
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y + NOTE_HEIGHT);
        ctx.lineTo(w, y + NOTE_HEIGHT);
        ctx.stroke();
      }
    }

    // Vertical grid lines (beats/bars)
    const beatsPerBar = timeSignature[0];
    const clipBeats = clip.durationBeats;
    for (let beat = 0; beat <= clipBeats; beat += 0.25) {
      const x = beat * ppb;
      if (x > w) break;
      const isBar = Math.abs(beat % beatsPerBar) < 0.001;
      const isBeat = Math.abs(beat % 1) < 0.001;

      ctx.strokeStyle = isBar ? 'rgba(255,255,255,0.15)' : isBeat ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.025)';
      ctx.lineWidth = isBar ? 1 : 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    // Draw notes
    const selectedClipIds = useStudioStore.getState().selectedClipIds;
    for (const note of clip.notes) {
      const x = note.startBeat * ppb;
      const nw = Math.max(note.durationBeats * ppb, 2);
      const y = (MAX_MIDI_NOTE - note.pitch) * NOTE_HEIGHT;
      const vel = note.velocity / 127;

      ctx.fillStyle = `rgba(34, 211, 238, ${0.3 + vel * 0.7})`;
      ctx.fillRect(x, y + 1, nw, NOTE_HEIGHT - 2);

      ctx.strokeStyle = 'rgba(34, 211, 238, 0.8)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y + 1, nw, NOTE_HEIGHT - 2);
    }
  }, [containerWidth, clip, zoomX, scrollX, timeSignature]);

  // Draw velocity lane
  const drawVelocity = useCallback(() => {
    const canvas = velocityRef.current;
    if (!canvas || !clip) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = containerWidth - PIANO_KEY_WIDTH;
    canvas.width = w * dpr;
    canvas.height = VELOCITY_LANE_HEIGHT * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${VELOCITY_LANE_HEIGHT}px`;
    ctx.scale(dpr, dpr);

    const ppb = getPixelsPerBeat(zoomX);

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, 0, w, VELOCITY_LANE_HEIGHT);

    for (const note of clip.notes) {
      const x = note.startBeat * ppb;
      const vel = note.velocity / 127;
      const barH = vel * (VELOCITY_LANE_HEIGHT - 4);

      ctx.fillStyle = `rgba(34, 211, 238, ${0.4 + vel * 0.6})`;
      ctx.fillRect(x, VELOCITY_LANE_HEIGHT - barH - 2, Math.max(3, note.durationBeats * ppb * 0.3), barH);
    }
  }, [containerWidth, clip, zoomX]);

  useEffect(() => { drawGrid(); drawVelocity(); }, [drawGrid, drawVelocity]);

  // Click to add/select notes
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!clip) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ppb = getPixelsPerBeat(zoomX);
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const beat = pixelToBeat(clickX, ppb, 0);
    const pitch = MAX_MIDI_NOTE - Math.floor(clickY / NOTE_HEIGHT);

    if (selectedTool === 'draw') {
      const snapped = snapToGrid(beat, snapValue, snapEnabled);
      const newNote: MidiNote = {
        id: crypto.randomUUID(),
        pitch: Math.max(0, Math.min(127, pitch)),
        startBeat: snapped,
        durationBeats: snapValue || 0.25,
        velocity: useStudioStore.getState().settings.typingKeyboardVelocity,
      };
      updateClip(clip.id, { notes: [...clip.notes, newNote] } as any);
    } else if (selectedTool === 'erase') {
      // Find and remove note at this position
      const hitNote = clip.notes.find((n) => {
        const ny = (MAX_MIDI_NOTE - n.pitch) * NOTE_HEIGHT;
        const nx = n.startBeat * ppb;
        const nw = n.durationBeats * ppb;
        return clickX >= nx && clickX <= nx + nw && clickY >= ny && clickY <= ny + NOTE_HEIGHT;
      });
      if (hitNote) {
        updateClip(clip.id, { notes: clip.notes.filter((n) => n.id !== hitNote.id) } as any);
      }
    }
  };

  // ─── No clip selected ─────────────────────────────────────────────────
  if (!clip || clip.type !== 'midi') {
    return (
      <div className="flex h-full items-center justify-center text-[var(--site-muted)]">
        <div className="text-center">
          <p className="text-sm">Select a MIDI clip to edit</p>
          <p className="mt-1 text-xs opacity-50">Double-click a clip in the arrangement</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex h-6 shrink-0 items-center gap-2 border-b border-[var(--site-border)] bg-[var(--site-surface)] px-3">
        <span className="text-xs font-medium text-[var(--site-text)]">{clip.name}</span>
        <span className="text-[10px] text-[var(--site-muted)]">{clip.notes.length} notes</span>
      </div>

      {/* Main area — single scroll container with sticky keyboard */}
      <div className="flex-1 overflow-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
        <div className="relative flex" style={{ height: TOTAL_NOTES * NOTE_HEIGHT }}>
          {/* Piano keyboard — sticky left */}
          <div
            className="sticky left-0 z-10 shrink-0"
            style={{ width: PIANO_KEY_WIDTH }}
          >
            {Array.from({ length: TOTAL_NOTES }, (_, i) => {
              const note = MAX_MIDI_NOTE - i;
              const name = NOTE_NAMES[note % 12];
              const octave = Math.floor(note / 12) - 1;
              const isBlack = name.includes('#');
              return (
                <div
                  key={note}
                  className={`flex items-center border-b border-r border-[var(--site-border)] text-[9px] ${
                    isBlack
                      ? 'border-b-black/30 bg-gray-800 text-gray-400'
                      : 'border-b-white/5 bg-gray-900 text-gray-300'
                  } ${name === 'C' ? 'font-bold' : ''}`}
                  style={{ height: NOTE_HEIGHT, paddingLeft: 4 }}
                >
                  {name === 'C' ? `C${octave}` : ''}
                </div>
              );
            })}
          </div>

          {/* Note grid canvas */}
          <canvas
            ref={canvasRef}
            className="cursor-crosshair"
            onClick={handleCanvasClick}
          />
        </div>
      </div>

      {/* Velocity lane */}
      <div className="flex shrink-0 border-t border-[var(--site-border)]">
        <div className="flex shrink-0 items-center justify-center bg-[var(--site-surface)] text-[9px] text-[var(--site-muted)]" style={{ width: PIANO_KEY_WIDTH }}>
          Vel
        </div>
        <canvas ref={velocityRef} />
      </div>
    </div>
  );
}
