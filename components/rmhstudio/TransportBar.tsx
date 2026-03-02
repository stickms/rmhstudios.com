/**
 * TransportBar — Top bar with play/pause/stop, BPM, pattern selector,
 * metronome toggle, project name, save/load, and view switcher.
 */
'use client';

import { useState, useCallback, useRef } from 'react';
import { useStudioStore } from '@/lib/rmhstudio/store';

interface TransportBarProps {
  onSaveClick: () => void;
  onLoadClick: () => void;
}

export default function TransportBar({ onSaveClick, onLoadClick }: TransportBarProps) {
  const {
    isPlaying, bpm, swing, currentStep,
    patterns, currentPatternId,
    projectName, masterVolume,
    settings,
    play, pause, stop, togglePlayPause,
    setBpm, setSwing, setCurrentPattern, addPattern,
    setProjectName, setMasterVolume, newProject,
    updateSettings, activeView, setActiveView,
  } = useStudioStore();

  const [editingBpm, setEditingBpm] = useState(false);
  const [bpmInput, setBpmInput] = useState(String(bpm));
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(projectName);
  const bpmDragRef = useRef({ startY: 0, startBpm: 0 });

  const handleBpmSubmit = useCallback(() => {
    const val = parseInt(bpmInput, 10);
    if (!isNaN(val)) setBpm(val);
    setEditingBpm(false);
  }, [bpmInput, setBpm]);

  const handleNameSubmit = useCallback(() => {
    if (nameInput.trim()) setProjectName(nameInput.trim());
    setEditingName(false);
  }, [nameInput, setProjectName]);

  const handleBpmPointerDown = useCallback((e: React.PointerEvent) => {
    if (editingBpm) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    bpmDragRef.current = { startY: e.clientY, startBpm: bpm };
  }, [bpm, editingBpm]);

  const handleBpmPointerMove = useCallback((e: React.PointerEvent) => {
    if (!(e.target as HTMLElement).hasPointerCapture(e.pointerId)) return;
    const dy = bpmDragRef.current.startY - e.clientY;
    const newBpm = Math.round(bpmDragRef.current.startBpm + dy * 0.5);
    setBpm(newBpm);
    setBpmInput(String(Math.max(40, Math.min(300, newBpm))));
  }, [setBpm]);

  const currentPattern = patterns.find(p => p.id === currentPatternId);

  return (
    <div className="rstudio-transport">
      {/* ── Transport Controls ── */}
      <button
        className={`rstudio-transport-btn ${isPlaying ? 'playing' : ''}`}
        onClick={togglePlayPause}
        title="Play / Pause (Space)"
      >
        {isPlaying ? (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <rect x="1" y="1" width="4" height="12" rx="1" />
            <rect x="9" y="1" width="4" height="12" rx="1" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <path d="M2 1.5l10 5.5-10 5.5z" />
          </svg>
        )}
      </button>

      <button className="rstudio-transport-btn" onClick={stop} title="Stop (Esc)">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
          <rect x="1" y="1" width="10" height="10" rx="1" />
        </svg>
      </button>

      <div className="rstudio-divider" />

      {/* ── BPM ── */}
      <div
        className="rstudio-bpm"
        onPointerDown={handleBpmPointerDown}
        onPointerMove={handleBpmPointerMove}
        style={{ cursor: editingBpm ? 'text' : 'ns-resize' }}
      >
        <span style={{ fontSize: 10, color: 'var(--rstudio-text-dim)' }}>BPM</span>
        {editingBpm ? (
          <input
            autoFocus
            value={bpmInput}
            onChange={e => setBpmInput(e.target.value)}
            onBlur={handleBpmSubmit}
            onKeyDown={e => e.key === 'Enter' && handleBpmSubmit()}
          />
        ) : (
          <span
            style={{ cursor: 'ns-resize', minWidth: 32, textAlign: 'center' }}
            onDoubleClick={() => { setEditingBpm(true); setBpmInput(String(bpm)); }}
          >
            {bpm}
          </span>
        )}
      </div>

      <div className="rstudio-divider" />

      {/* ── Pattern Selector ── */}
      <select
        value={currentPatternId}
        onChange={e => setCurrentPattern(e.target.value)}
        style={{
          background: 'var(--rstudio-bg)',
          border: '1px solid var(--rstudio-border)',
          borderRadius: 'var(--rstudio-radius-sm)',
          color: 'var(--rstudio-text)',
          fontSize: 12,
          padding: '4px 8px',
          height: 32,
        }}
      >
        {patterns.map(p => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>

      <button
        className="rstudio-transport-btn"
        onClick={addPattern}
        title="Add Pattern"
        style={{ fontSize: 16 }}
      >
        +
      </button>

      {/* ── Step Count ── */}
      {currentPattern && (
        <select
          value={currentPattern.stepCount}
          onChange={e => {
            const sc = parseInt(e.target.value, 10);
            useStudioStore.getState().setStepCount(currentPatternId, sc);
          }}
          style={{
            background: 'var(--rstudio-bg)',
            border: '1px solid var(--rstudio-border)',
            borderRadius: 'var(--rstudio-radius-sm)',
            color: 'var(--rstudio-text-dim)',
            fontSize: 11,
            padding: '4px 6px',
            height: 32,
          }}
          title="Steps per pattern"
        >
          <option value={16}>16</option>
          <option value={32}>32</option>
          <option value={64}>64</option>
        </select>
      )}

      <div className="rstudio-divider" />

      {/* ── Metronome ── */}
      <button
        className={`rstudio-transport-btn ${settings.metronomeEnabled ? 'active' : ''}`}
        onClick={() => updateSettings({ metronomeEnabled: !settings.metronomeEnabled })}
        title="Metronome (M)"
        style={{ fontSize: 13 }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M12 2L8 22h8L12 2z" />
          <line x1="12" y1="8" x2="18" y2="4" />
        </svg>
      </button>

      {/* ── Spacer ── */}
      <div className="flex-1" />

      {/* ── Project Name ── */}
      {editingName ? (
        <input
          autoFocus
          value={nameInput}
          onChange={e => setNameInput(e.target.value)}
          onBlur={handleNameSubmit}
          onKeyDown={e => e.key === 'Enter' && handleNameSubmit()}
          style={{
            background: 'var(--rstudio-bg)',
            border: '1px solid var(--rstudio-border)',
            borderRadius: 'var(--rstudio-radius-sm)',
            color: 'var(--rstudio-text)',
            fontSize: 13,
            padding: '4px 8px',
            height: 32,
            width: 180,
          }}
        />
      ) : (
        <span
          className="cursor-pointer"
          style={{ fontSize: 13, color: 'var(--rstudio-text-muted)' }}
          onDoubleClick={() => { setEditingName(true); setNameInput(projectName); }}
          title="Double-click to rename"
        >
          {projectName}
        </span>
      )}

      <div className="rstudio-divider" />

      {/* ── Save / Load ── */}
      <button className="rstudio-transport-btn" onClick={onSaveClick} title="Save Project (Ctrl+S)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
          <polyline points="17 21 17 13 7 13 7 21" />
          <polyline points="7 3 7 8 15 8" />
        </svg>
      </button>
      <button className="rstudio-transport-btn" onClick={onLoadClick} title="Open Project (Ctrl+O)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
        </svg>
      </button>
      <button className="rstudio-transport-btn" onClick={newProject} title="New Project (Ctrl+N)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="12" y1="18" x2="12" y2="12" />
          <line x1="9" y1="15" x2="15" y2="15" />
        </svg>
      </button>

      <div className="rstudio-divider" />

      {/* ── View Switcher ── */}
      <button
        className={`rstudio-view-tab ${activeView === 'sequencer' ? 'active' : ''}`}
        onClick={() => setActiveView('sequencer')}
      >
        Sequencer
      </button>
      <button
        className={`rstudio-view-tab ${activeView === 'mixer' ? 'active' : ''}`}
        onClick={() => setActiveView('mixer')}
      >
        Mixer
      </button>
    </div>
  );
}
