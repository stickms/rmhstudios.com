/**
 * DAWLayout — Main layout orchestrator for RMHStudio.
 *
 * TransportBar at top, content area switches between
 * StepSequencer+ChannelRack and MixerView.
 * Handles keyboard shortcuts.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useStudioStore } from '@/lib/rmhstudio/store';
import { saveProject } from '@/lib/rmhstudio/storage';
import TransportBar from './TransportBar';
import ChannelRack from './ChannelRack';
import StepSequencer from './StepSequencer';
import MixerView from './MixerView';
import ProjectDialog from './ProjectDialog';

export default function DAWLayout() {
  const activeView = useStudioStore(s => s.activeView);
  const togglePlayPause = useStudioStore(s => s.togglePlayPause);
  const stop = useStudioStore(s => s.stop);
  const updateSettings = useStudioStore(s => s.updateSettings);
  const settings = useStudioStore(s => s.settings);
  const getProjectData = useStudioStore(s => s.getProjectData);
  const newProject = useStudioStore(s => s.newProject);

  const [dialogMode, setDialogMode] = useState<'save' | 'load' | null>(null);

  // ── Keyboard Shortcuts ────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture when typing in an input
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          togglePlayPause();
          break;
        case 'Escape':
          stop();
          break;
        case 'm':
        case 'M':
          updateSettings({ metronomeEnabled: !settings.metronomeEnabled });
          break;
        case 's':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            // Quick save
            const data = getProjectData();
            saveProject(data);
          }
          break;
        case 'n':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            newProject();
          }
          break;
        case 'o':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            setDialogMode('load');
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlayPause, stop, updateSettings, settings.metronomeEnabled, getProjectData, newProject]);

  const handleSaveClick = useCallback(() => setDialogMode('save'), []);
  const handleLoadClick = useCallback(() => setDialogMode('load'), []);
  const handleDialogClose = useCallback(() => setDialogMode(null), []);

  return (
    <div className="flex flex-col h-screen">
      {/* Transport */}
      <TransportBar
        onSaveClick={handleSaveClick}
        onLoadClick={handleLoadClick}
      />

      {/* Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {activeView === 'sequencer' && (
          <>
            <ChannelRack />
            <StepSequencer />
          </>
        )}
        {activeView === 'mixer' && (
          <MixerView />
        )}
      </div>

      {/* Project Dialog */}
      {dialogMode && (
        <ProjectDialog
          mode={dialogMode}
          open={!!dialogMode}
          onClose={handleDialogClose}
        />
      )}
    </div>
  );
}
