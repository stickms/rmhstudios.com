import { useEffect, useCallback, useRef } from 'react';
import { useStudioStore } from '../store';
import {
  TYPING_KEYBOARD_MAP,
  eventToKeyString,
  findActionForKey,
  resolveKeybinds,
} from '../keybinds';
import { MIDDLE_C } from '../constants';
import type { ViewMode, ToolMode } from '../types';

/**
 * useKeybinds — global keyboard handler for the DAW.
 *
 * Handles:
 * 1. DAW keybinds (transport, tools, editing, navigation)
 * 2. Typing keyboard (QWERTY → MIDI notes) when enabled
 *
 * Skips all keybinds when focus is in a text input/textarea/contenteditable.
 */
export function useKeybinds(
  onNoteOn?: (midiNote: number, velocity: number) => void,
  onNoteOff?: (midiNote: number) => void,
) {
  const activeKeysRef = useRef(new Set<string>());

  const handleAction = useCallback((actionId: string) => {
    const store = useStudioStore.getState();

    switch (actionId) {
      // Transport
      case 'transport.playPause':
        store.setIsPlaying(!store.isPlaying);
        break;
      case 'transport.stop':
        store.setIsPlaying(false);
        store.setCurrentBeat(0);
        break;
      case 'transport.record':
        store.setIsRecording(!store.isRecording);
        break;
      case 'transport.loop':
        store.setLoopEnabled(!store.loopEnabled);
        break;
      case 'transport.metronome':
        store.setMetronomeEnabled(!store.metronomeEnabled);
        break;

      // Navigation
      case 'view.arrangement':
        store.setActiveView('arrangement');
        break;
      case 'view.pianoRoll':
        store.setActiveView('pianoRoll');
        break;
      case 'view.mixer':
        store.setActiveView('mixer');
        break;
      case 'view.pattern':
        store.setActiveView('pattern');
        break;
      case 'view.cycle': {
        const views: ViewMode[] = ['arrangement', 'pianoRoll', 'mixer', 'pattern'];
        const idx = views.indexOf(store.activeView);
        store.setActiveView(views[(idx + 1) % views.length]);
        break;
      }

      // Tools
      case 'tool.select':
        store.setSelectedTool('select');
        break;
      case 'tool.draw':
        store.setSelectedTool('draw');
        break;
      case 'tool.erase':
        store.setSelectedTool('erase');
        break;
      case 'tool.slice':
        store.setSelectedTool('slice');
        break;
      case 'tool.mute':
        store.setSelectedTool('mute');
        break;

      // Zoom
      case 'zoom.in':
        store.setZoom(Math.min(store.zoomX * 1.25, 10), store.zoomY);
        break;
      case 'zoom.out':
        store.setZoom(Math.max(store.zoomX / 1.25, 0.1), store.zoomY);
        break;

      // Typing keyboard
      case 'typingKeyboard.toggle':
        store.setTypingKeyboardEnabled(!store.typingKeyboardEnabled);
        break;
      case 'typingKeyboard.octaveUp':
        store.setTypingKeyboardOctave(store.typingKeyboardOctave + 1);
        break;
      case 'typingKeyboard.octaveDown':
        store.setTypingKeyboardOctave(store.typingKeyboardOctave - 1);
        break;

      // Track
      case 'track.muteSelected':
        if (store.selectedTrackId) store.toggleTrackMute(store.selectedTrackId);
        break;
      case 'track.soloSelected':
        if (store.selectedTrackId) store.toggleTrackSolo(store.selectedTrackId);
        break;
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if focused in a text input
      const tag = (e.target as HTMLElement)?.tagName;
      const isEditable = (e.target as HTMLElement)?.isContentEditable;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || isEditable) return;

      const store = useStudioStore.getState();
      const keyString = eventToKeyString(e);
      const keybindMap = resolveKeybinds(store.settings.keybindOverrides);

      // Check for DAW action keybind
      const actionId = findActionForKey(keyString, keybindMap, store.typingKeyboardEnabled);
      if (actionId) {
        e.preventDefault();
        handleAction(actionId);
        return;
      }

      // Typing keyboard: map key to MIDI note
      if (store.typingKeyboardEnabled && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const key = e.key.toLowerCase();
        const semitoneOffset = TYPING_KEYBOARD_MAP[key];
        if (semitoneOffset !== undefined && !activeKeysRef.current.has(key)) {
          e.preventDefault();
          activeKeysRef.current.add(key);
          const midiNote = (store.typingKeyboardOctave * 12) + semitoneOffset;
          if (midiNote >= 0 && midiNote <= 127) {
            onNoteOn?.(midiNote, store.settings.typingKeyboardVelocity);
          }
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isEditable = (e.target as HTMLElement)?.isContentEditable;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || isEditable) return;

      const store = useStudioStore.getState();

      if (store.typingKeyboardEnabled) {
        const key = e.key.toLowerCase();
        if (activeKeysRef.current.has(key)) {
          activeKeysRef.current.delete(key);
          const semitoneOffset = TYPING_KEYBOARD_MAP[key];
          if (semitoneOffset !== undefined) {
            const midiNote = (store.typingKeyboardOctave * 12) + semitoneOffset;
            if (midiNote >= 0 && midiNote <= 127) {
              onNoteOff?.(midiNote);
            }
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleAction, onNoteOn, onNoteOff]);
}
