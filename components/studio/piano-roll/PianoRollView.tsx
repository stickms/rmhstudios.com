import {
  useRef,
  useState,
  useEffect,
  useCallback,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useStudioStore } from '@/lib/studio/store';
import { shiftSelection, shiftStep, transposeSelection } from '@/lib/studio/edit-commands';
import {
  NOTE_NAMES,
  MIN_MIDI_NOTE,
  MAX_MIDI_NOTE,
  NOTE_HEIGHT,
  PIANO_KEY_WIDTH,
} from '@/lib/studio/constants';
import {
  getPixelsPerBeat,
  snapToGrid,
  pixelToBeat,
} from '@/lib/studio/utils/grid';
import type {
  MidiNote,
  MidiClipData,
} from '@/lib/studio/types';

const TOTAL_NOTES =
  MAX_MIDI_NOTE -
  MIN_MIDI_NOTE +
  1;
const VELOCITY_LANE_HEIGHT = 48;

export function PianoRollView() {
  const {
    t,
  } =
    useTranslation(
      'c-studio',
    );
  const containerRef =
    useRef<HTMLDivElement>(
      null,
    );
  const canvasRef =
    useRef<HTMLCanvasElement>(
      null,
    );
  const velocityRef =
    useRef<HTMLCanvasElement>(
      null,
    );
  const [
    containerWidth,
    setContainerWidth,
  ] =
    useState(
      800,
    );
  const [
    containerHeight,
    setContainerHeight,
  ] =
    useState(
      400,
    );

  const {
    pianoRollClipId,
    clips,
    zoomX,
    scrollX,
    scrollY,
    setScroll,
    selectedTool,
    snapEnabled,
    snapValue,
    timeSignature,
    updateClip,
    selectedNoteIds,
    selectNotes,
  } =
    useStudioStore();

  // Marquee rectangle (canvas pixels) while dragging with the select tool.
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const dragRef = useRef<{ x0: number; y0: number; additive: boolean; moved: boolean } | null>(null);
  // The note the keyboard cursor is on (arrow keys move it, space toggles it).
  const [cursorNoteId, setCursorNoteId] = useState<string | null>(null);

  const clip =
    pianoRollClipId
      ? (clips[
          pianoRollClipId
        ] as
          | MidiClipData
          | undefined)
      : undefined;

  // Resize observer
  useEffect(() => {
    const el =
      containerRef.current;
    if (
      !el
    )
      return;
    const ro =
      new ResizeObserver(
        (
          entries,
        ) => {
          const r =
            entries[0]
              ?.contentRect;
          if (
            r
          ) {
            setContainerWidth(
              r.width,
            );
            setContainerHeight(
              r.height,
            );
          }
        },
      );
    ro.observe(
      el,
    );
    return () =>
      ro.disconnect();
  }, []);

  // Draw note grid
  const drawGrid =
    useCallback(() => {
      const canvas =
        canvasRef.current;
      if (
        !canvas ||
        !clip
      )
        return;
      const ctx =
        canvas.getContext(
          '2d',
        );
      if (
        !ctx
      )
        return;

      const dpr =
        window.devicePixelRatio ||
        1;
      const w =
        containerWidth -
        PIANO_KEY_WIDTH;
      const h =
        TOTAL_NOTES *
        NOTE_HEIGHT;
      canvas.width =
        w *
        dpr;
      canvas.height =
        h *
        dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.scale(
        dpr,
        dpr,
      );

      const ppb =
        getPixelsPerBeat(
          zoomX,
        );

      // Background
      ctx.fillStyle =
        '#0d0d1a';
      ctx.fillRect(
        0,
        0,
        w,
        h,
      );

      // Note rows — alternate white/black key shading
      for (
        let note =
          MIN_MIDI_NOTE;
        note <=
        MAX_MIDI_NOTE;
        note++
      ) {
        const y =
          (MAX_MIDI_NOTE -
            note) *
          NOTE_HEIGHT;
        const noteName =
          NOTE_NAMES[
            note %
              12
          ];
        const isBlack =
          noteName.includes(
            '#',
          );

        ctx.fillStyle =
          isBlack
            ? 'rgba(0,0,0,0.3)'
            : 'rgba(255,255,255,0.02)';
        ctx.fillRect(
          0,
          y,
          w,
          NOTE_HEIGHT,
        );

        // Row border
        ctx.strokeStyle =
          'rgba(255,255,255,0.04)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(
          0,
          y +
            NOTE_HEIGHT,
        );
        ctx.lineTo(
          w,
          y +
            NOTE_HEIGHT,
        );
        ctx.stroke();

        // C note highlight
        if (
          noteName ===
          'C'
        ) {
          ctx.strokeStyle =
            'rgba(255,255,255,0.1)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(
            0,
            y +
              NOTE_HEIGHT,
          );
          ctx.lineTo(
            w,
            y +
              NOTE_HEIGHT,
          );
          ctx.stroke();
        }
      }

      // Vertical grid lines (beats/bars)
      const beatsPerBar =
        timeSignature[0];
      const clipBeats =
        clip.durationBeats;
      for (
        let beat = 0;
        beat <=
        clipBeats;
        beat += 0.25
      ) {
        const x =
          beat *
          ppb;
        if (
          x >
          w
        )
          break;
        const isBar =
          Math.abs(
            beat %
              beatsPerBar,
          ) <
          0.001;
        const isBeat =
          Math.abs(
            beat %
              1,
          ) <
          0.001;

        ctx.strokeStyle =
          isBar
            ? 'rgba(255,255,255,0.15)'
            : isBeat
              ? 'rgba(255,255,255,0.06)'
              : 'rgba(255,255,255,0.025)';
        ctx.lineWidth =
          isBar
            ? 1
            : 0.5;
        ctx.beginPath();
        ctx.moveTo(
          x,
          0,
        );
        ctx.lineTo(
          x,
          h,
        );
        ctx.stroke();
      }

      // Draw notes
      const selectedClipIds =
        useStudioStore.getState()
          .selectedClipIds;
      for (const note of clip.notes) {
        const x =
          note.startBeat *
          ppb;
        const nw =
          Math.max(
            note.durationBeats *
              ppb,
            2,
          );
        const y =
          (MAX_MIDI_NOTE -
            note.pitch) *
          NOTE_HEIGHT;
        const vel =
          note.velocity /
          127;

        ctx.fillStyle = `rgba(34, 211, 238, ${0.3 + vel * 0.7})`;
        ctx.fillRect(
          x,
          y +
            1,
          nw,
          NOTE_HEIGHT -
            2,
        );

        const isSelected = selectedNoteIds.includes(note.id);
        ctx.strokeStyle = isSelected
          ? 'rgba(255, 255, 255, 0.95)'
          : 'rgba(34, 211, 238, 0.8)';
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.strokeRect(
          x,
          y + 1,
          nw,
          NOTE_HEIGHT - 2,
        );
        if (note.id === cursorNoteId) {
          ctx.setLineDash([3, 2]);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
          ctx.lineWidth = 1;
          ctx.strokeRect(x - 2, y - 1, nw + 4, NOTE_HEIGHT + 2);
          ctx.setLineDash([]);
        }
      }
      if (marquee) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 1;
        ctx.strokeRect(
          Math.min(marquee.x0, marquee.x1),
          Math.min(marquee.y0, marquee.y1),
          Math.abs(marquee.x1 - marquee.x0),
          Math.abs(marquee.y1 - marquee.y0),
        );
      }
    }, [
      containerWidth,
      clip,
      zoomX,
      scrollX,
      timeSignature,
      selectedNoteIds,
      marquee,
      cursorNoteId,
    ]);

  // Draw velocity lane
  const drawVelocity =
    useCallback(() => {
      const canvas =
        velocityRef.current;
      if (
        !canvas ||
        !clip
      )
        return;
      const ctx =
        canvas.getContext(
          '2d',
        );
      if (
        !ctx
      )
        return;

      const dpr =
        window.devicePixelRatio ||
        1;
      const w =
        containerWidth -
        PIANO_KEY_WIDTH;
      canvas.width =
        w *
        dpr;
      canvas.height =
        VELOCITY_LANE_HEIGHT *
        dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${VELOCITY_LANE_HEIGHT}px`;
      ctx.scale(
        dpr,
        dpr,
      );

      const ppb =
        getPixelsPerBeat(
          zoomX,
        );

      ctx.fillStyle =
        'rgba(0,0,0,0.3)';
      ctx.fillRect(
        0,
        0,
        w,
        VELOCITY_LANE_HEIGHT,
      );

      for (const note of clip.notes) {
        const x =
          note.startBeat *
          ppb;
        const vel =
          note.velocity /
          127;
        const barH =
          vel *
          (VELOCITY_LANE_HEIGHT -
            4);

        ctx.fillStyle = `rgba(34, 211, 238, ${0.4 + vel * 0.6})`;
        ctx.fillRect(
          x,
          VELOCITY_LANE_HEIGHT -
            barH -
            2,
          Math.max(
            3,
            note.durationBeats *
              ppb *
              0.3,
          ),
          barH,
        );
      }
    }, [
      containerWidth,
      clip,
      zoomX,
    ]);

  useEffect(() => {
    drawGrid();
    drawVelocity();
  }, [
    drawGrid,
    drawVelocity,
  ]);

  // Click to add/select notes
  const handleCanvasClick =
    (
      e: React.MouseEvent<HTMLCanvasElement>,
    ) => {
      if (
        !clip ||
        selectedTool === 'select'
      )
        return;
      const rect =
        canvasRef.current?.getBoundingClientRect();
      if (
        !rect
      )
        return;
      const ppb =
        getPixelsPerBeat(
          zoomX,
        );
      const clickX =
        e.clientX -
        rect.left;
      const clickY =
        e.clientY -
        rect.top;
      const beat =
        pixelToBeat(
          clickX,
          ppb,
          0,
        );
      const pitch =
        MAX_MIDI_NOTE -
        Math.floor(
          clickY /
            NOTE_HEIGHT,
        );

      if (
        selectedTool ===
        'draw'
      ) {
        const snapped =
          snapToGrid(
            beat,
            snapValue,
            snapEnabled,
          );
        const newNote: MidiNote =
          {
            id: crypto.randomUUID(),
            pitch:
              Math.max(
                0,
                Math.min(
                  127,
                  pitch,
                ),
              ),
            startBeat:
              snapped,
            durationBeats:
              snapValue ||
              0.25,
            velocity:
              useStudioStore.getState()
                .settings
                .typingKeyboardVelocity,
          };
        updateClip(
          clip.id,
          {
            notes:
              [
                ...clip.notes,
                newNote,
              ],
          } as any,
        );
      } else if (
        selectedTool ===
        'erase'
      ) {
        // Find and remove note at this position
        const hitNote =
          clip.notes.find(
            (
              n,
            ) => {
              const ny =
                (MAX_MIDI_NOTE -
                  n.pitch) *
                NOTE_HEIGHT;
              const nx =
                n.startBeat *
                ppb;
              const nw =
                n.durationBeats *
                ppb;
              return (
                clickX >=
                  nx &&
                clickX <=
                  nx +
                    nw &&
                clickY >=
                  ny &&
                clickY <=
                  ny +
                    NOTE_HEIGHT
              );
            },
          );
        if (
          hitNote
        ) {
          updateClip(
            clip.id,
            {
              notes:
                clip.notes.filter(
                  (
                    n,
                  ) =>
                    n.id !==
                    hitNote.id,
                ),
            } as any,
          );
        }
      }
    };


  // ─── Selection (select tool): click, shift-click, marquee, keyboard ───
  const noteRect = (n: MidiNote, ppb: number) => ({
    x: n.startBeat * ppb,
    y: (MAX_MIDI_NOTE - n.pitch) * NOTE_HEIGHT,
    w: Math.max(n.durationBeats * ppb, 2),
    h: NOTE_HEIGHT,
  });

  const canvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!clip || selectedTool !== 'select') return;
    const p = canvasPoint(e);
    dragRef.current = { x0: p.x, y0: p.y, additive: e.shiftKey, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.currentTarget.focus();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const p = canvasPoint(e);
    if (!d.moved && Math.hypot(p.x - d.x0, p.y - d.y0) < 4) return;
    d.moved = true;
    setMarquee({ x0: d.x0, y0: d.y0, x1: p.x, y1: p.y });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    dragRef.current = null;
    setMarquee(null);
    if (!d || !clip) return;
    const p = canvasPoint(e);
    const ppb = getPixelsPerBeat(zoomX);
    let hit: string[];
    if (d.moved) {
      const x0 = Math.min(d.x0, p.x);
      const x1 = Math.max(d.x0, p.x);
      const y0 = Math.min(d.y0, p.y);
      const y1 = Math.max(d.y0, p.y);
      hit = clip.notes
        .filter((n) => {
          const r = noteRect(n, ppb);
          return r.x <= x1 && r.x + r.w >= x0 && r.y <= y1 && r.y + r.h >= y0;
        })
        .map((n) => n.id);
    } else {
      const n = clip.notes.find((note) => {
        const r = noteRect(note, ppb);
        return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
      });
      hit = n ? [n.id] : [];
      if (n) setCursorNoteId(n.id);
      if (n && d.additive && selectedNoteIds.includes(n.id)) {
        selectNotes(selectedNoteIds.filter((id) => id !== n.id));
        return;
      }
    }
    selectNotes(d.additive ? Array.from(new Set([...selectedNoteIds, ...hit])) : hit);
  };

  // Alt+Left/Right walks the cursor through the notes in time order; Space toggles the cursor note; the arrow
  // keys move the selected notes (or the cursor note when none are selected) by a semitone or a snap step.
  const handleCanvasKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (!clip || e.ctrlKey || e.metaKey) return;
    const ordered = [...clip.notes].sort((a, b) => a.startBeat - b.startBeat || b.pitch - a.pitch);
    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      const i = ordered.findIndex((n) => n.id === cursorNoteId);
      const next = ordered[Math.max(0, Math.min(ordered.length - 1, i + (e.key === 'ArrowRight' ? 1 : -1)))];
      if (next) setCursorNoteId(next.id);
      return;
    }
    if (e.key === ' ' && cursorNoteId) {
      e.preventDefault();
      e.stopPropagation();
      selectNotes(
        selectedNoteIds.includes(cursorNoteId)
          ? selectedNoteIds.filter((id) => id !== cursorNoteId)
          : [...selectedNoteIds, cursorNoteId],
      );
      return;
    }
    const arrow = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key];
    if (!arrow || e.altKey) return;
    e.preventDefault();
    if (selectedNoteIds.length === 0 && cursorNoteId) selectNotes([cursorNoteId]);
    const state = useStudioStore.getState();
    if (state.selectedNoteIds.length === 0) return;
    if (arrow[1] !== 0) transposeSelection(arrow[1]);
    else shiftSelection(arrow[0] * shiftStep());
  };

  // ─── No clip selected ─────────────────────────────────────────────────
  if (
    !clip ||
    clip.type !==
      'midi'
  ) {
    return (
      <div className="flex h-full items-center justify-center text-app-text-muted">
        <div className="text-center">
          <p className="text-sm">
            {t(
              'select-midi-clip',
              {
                defaultValue:
                  'Select a MIDI clip to edit',
              },
            )}
          </p>
          <p className="mt-1 text-xs opacity-50">
            {t(
              'double-click-clip-hint',
              {
                defaultValue:
                  'Double-click a clip in the arrangement',
              },
            )}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={
        containerRef
      }
      className="flex h-full flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="flex h-6 shrink-0 items-center gap-2 border-b border-app-border bg-app-surface px-3">
        <span className="text-xs font-medium text-app-text">
          {
            clip.name
          }
        </span>
        <span className="sr-only" role="status" aria-live="polite">
          {selectedNoteIds.length > 0
            ? t('notes-selected', {
                ns: 'studio-editing',
                defaultValue: '{{count}} notes selected',
                count: selectedNoteIds.length,
              })
            : ''}
        </span>
        <span className="text-xs text-app-text-muted">
          {t(
            'note-count',
            {
              defaultValue:
                '{{count}} notes',
              count:
                clip
                  .notes
                  .length,
            },
          )}
        </span>
      </div>

      {/* Main area — single scroll container with sticky keyboard */}
      <div className="flex-1 overflow-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-(--app-border)">
        <div
          className="relative flex"
          style={{
            height:
              TOTAL_NOTES *
              NOTE_HEIGHT,
          }}
        >
          {/* Piano keyboard — sticky left */}
          <div
            className="sticky left-0 z-10 shrink-0"
            style={{
              width:
                PIANO_KEY_WIDTH,
            }}
          >
            {Array.from(
              {
                length:
                  TOTAL_NOTES,
              },
              (
                _,
                i,
              ) => {
                const note =
                  MAX_MIDI_NOTE -
                  i;
                const name =
                  NOTE_NAMES[
                    note %
                      12
                  ];
                const octave =
                  Math.floor(
                    note /
                      12,
                  ) -
                  1;
                const isBlack =
                  name.includes(
                    '#',
                  );
                return (
                  <div
                    key={
                      note
                    }
                    className={`flex items-center border-b border-r border-app-border text-xs ${
                      isBlack
                        ? 'border-b-app-border bg-app-bg-subtle text-app-text-muted'
                        : 'border-b-app-border bg-app-surface text-app-text'
                    } ${name === 'C' ? 'font-bold' : ''}`}
                    style={{
                      height:
                        NOTE_HEIGHT,
                      paddingLeft: 4,
                    }}
                  >
                    {name ===
                    'C'
                      ? `C${octave}`
                      : ''}
                  </div>
                );
              },
            )}
          </div>

          {/* Note grid canvas */}
          <canvas
            ref={
              canvasRef
            }
            className="cursor-crosshair"
            tabIndex={0}
            role="application"
            aria-label={t('note-grid-label', {
              ns: 'studio-editing',
              defaultValue:
                'Note grid. Alt and arrow keys choose a note, space selects it, arrow keys move it.',
            })}
            onClick={
              handleCanvasClick
            }
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onKeyDown={handleCanvasKeyDown}
          />
        </div>
      </div>

      {/* Velocity lane */}
      <div className="flex shrink-0 border-t border-app-border">
        <div
          className="flex shrink-0 items-center justify-center bg-app-surface text-xs text-app-text-muted"
          style={{
            width:
              PIANO_KEY_WIDTH,
          }}
        >
          {t(
            'velocity-abbr',
            {
              defaultValue:
                'Vel',
            },
          )}
        </div>
        <canvas
          ref={
            velocityRef
          }
        />
      </div>
    </div>
  );
}
