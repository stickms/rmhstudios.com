import type { KeybindAction, KeybindMap } from './types';

// ─── Action Registry ────────────────────────────────────────────────────────

export const KEYBIND_ACTIONS: KeybindAction[] = [
  // Transport
  { id: 'transport.playPause', category: 'Transport', label: 'Play / Pause', defaultKeys: ['Space'], allowInTypingKeyboard: true },
  { id: 'transport.stop', category: 'Transport', label: 'Stop', defaultKeys: ['Shift+Space'], allowInTypingKeyboard: true },
  { id: 'transport.record', category: 'Transport', label: 'Toggle Record', defaultKeys: ['Ctrl+R'], allowInTypingKeyboard: true },
  { id: 'transport.loop', category: 'Transport', label: 'Toggle Loop', defaultKeys: ['Ctrl+L'], allowInTypingKeyboard: true },
  { id: 'transport.metronome', category: 'Transport', label: 'Toggle Metronome', defaultKeys: ['Ctrl+M'], allowInTypingKeyboard: true },

  // Navigation
  { id: 'view.arrangement', category: 'Navigation', label: 'Arrangement View', defaultKeys: ['1'], allowInTypingKeyboard: false },
  { id: 'view.pianoRoll', category: 'Navigation', label: 'Piano Roll View', defaultKeys: ['2'], allowInTypingKeyboard: false },
  { id: 'view.mixer', category: 'Navigation', label: 'Mixer View', defaultKeys: ['3'], allowInTypingKeyboard: false },
  { id: 'view.pattern', category: 'Navigation', label: 'Pattern View', defaultKeys: ['4'], allowInTypingKeyboard: false },
  { id: 'view.cycle', category: 'Navigation', label: 'Cycle Views', defaultKeys: ['Tab'], allowInTypingKeyboard: true },

  // Editing
  { id: 'edit.undo', category: 'Editing', label: 'Undo', defaultKeys: ['Ctrl+Z'], allowInTypingKeyboard: true },
  { id: 'edit.redo', category: 'Editing', label: 'Redo', defaultKeys: ['Ctrl+Shift+Z'], allowInTypingKeyboard: true },
  { id: 'edit.copy', category: 'Editing', label: 'Copy', defaultKeys: ['Ctrl+C'], allowInTypingKeyboard: true },
  { id: 'edit.paste', category: 'Editing', label: 'Paste', defaultKeys: ['Ctrl+V'], allowInTypingKeyboard: true },
  { id: 'edit.cut', category: 'Editing', label: 'Cut', defaultKeys: ['Ctrl+X'], allowInTypingKeyboard: true },
  { id: 'edit.delete', category: 'Editing', label: 'Delete Selected', defaultKeys: ['Delete', 'Backspace'], allowInTypingKeyboard: true },
  { id: 'edit.selectAll', category: 'Editing', label: 'Select All', defaultKeys: ['Ctrl+A'], allowInTypingKeyboard: true },
  { id: 'edit.duplicate', category: 'Editing', label: 'Duplicate', defaultKeys: ['Ctrl+D'], allowInTypingKeyboard: true },

  // Project
  { id: 'project.save', category: 'Project', label: 'Save Project', defaultKeys: ['Ctrl+S'], allowInTypingKeyboard: true },
  { id: 'project.saveAs', category: 'Project', label: 'Save As...', defaultKeys: ['Ctrl+Shift+S'], allowInTypingKeyboard: true },
  { id: 'project.export', category: 'Project', label: 'Export', defaultKeys: ['Ctrl+E'], allowInTypingKeyboard: true },

  // Tools
  { id: 'tool.select', category: 'Tools', label: 'Select Tool', defaultKeys: ['V'], allowInTypingKeyboard: false },
  { id: 'tool.draw', category: 'Tools', label: 'Draw Tool', defaultKeys: ['B'], allowInTypingKeyboard: false },
  { id: 'tool.erase', category: 'Tools', label: 'Erase Tool', defaultKeys: ['E'], allowInTypingKeyboard: false },
  { id: 'tool.slice', category: 'Tools', label: 'Slice Tool', defaultKeys: ['S'], allowInTypingKeyboard: false },
  { id: 'tool.mute', category: 'Tools', label: 'Mute Tool', defaultKeys: ['Q'], allowInTypingKeyboard: false },

  // Piano Roll
  { id: 'pianoRoll.transposeUp', category: 'Piano Roll', label: 'Transpose Up (semitone)', defaultKeys: ['Ctrl+ArrowUp'], allowInTypingKeyboard: true },
  { id: 'pianoRoll.transposeDown', category: 'Piano Roll', label: 'Transpose Down (semitone)', defaultKeys: ['Ctrl+ArrowDown'], allowInTypingKeyboard: true },
  { id: 'pianoRoll.transposeOctaveUp', category: 'Piano Roll', label: 'Transpose Up (octave)', defaultKeys: ['Ctrl+Shift+ArrowUp'], allowInTypingKeyboard: true },
  { id: 'pianoRoll.transposeOctaveDown', category: 'Piano Roll', label: 'Transpose Down (octave)', defaultKeys: ['Ctrl+Shift+ArrowDown'], allowInTypingKeyboard: true },
  { id: 'pianoRoll.shiftLeft', category: 'Piano Roll', label: 'Shift Notes Left', defaultKeys: ['Ctrl+ArrowLeft'], allowInTypingKeyboard: true },
  { id: 'pianoRoll.shiftRight', category: 'Piano Roll', label: 'Shift Notes Right', defaultKeys: ['Ctrl+ArrowRight'], allowInTypingKeyboard: true },

  // Zoom
  { id: 'zoom.in', category: 'Zoom', label: 'Zoom In', defaultKeys: ['Ctrl+='], allowInTypingKeyboard: true },
  { id: 'zoom.out', category: 'Zoom', label: 'Zoom Out', defaultKeys: ['Ctrl+-'], allowInTypingKeyboard: true },

  // Typing Keyboard
  { id: 'typingKeyboard.toggle', category: 'Typing Keyboard', label: 'Toggle Typing Keyboard', defaultKeys: ['\\'], allowInTypingKeyboard: true },
  { id: 'typingKeyboard.octaveUp', category: 'Typing Keyboard', label: 'Octave Up', defaultKeys: ['+'], allowInTypingKeyboard: true },
  { id: 'typingKeyboard.octaveDown', category: 'Typing Keyboard', label: 'Octave Down', defaultKeys: ['-'], allowInTypingKeyboard: true },

  // Track
  { id: 'track.muteSelected', category: 'Track', label: 'Mute Selected Track', defaultKeys: ['Ctrl+Shift+M'], allowInTypingKeyboard: true },
  { id: 'track.soloSelected', category: 'Track', label: 'Solo Selected Track', defaultKeys: ['Ctrl+Shift+S'], allowInTypingKeyboard: true },
];

// ─── Typing Keyboard Layout ────────────────────────────────────────────────

/**
 * Maps keyboard keys to semitone offsets from the base octave.
 * Lower row (Z-M) = base octave, upper row (Q-P) = base+1 octave.
 * Number row provides sharps/flats for the upper row.
 */
export const TYPING_KEYBOARD_MAP: Record<string, number> = {
  // Lower row — base octave (C to B)
  'z': 0,   // C
  's': 1,   // C#
  'x': 2,   // D
  'd': 3,   // D#
  'c': 4,   // E
  'v': 5,   // F
  'g': 6,   // F#
  'b': 7,   // G
  'h': 8,   // G#
  'n': 9,   // A
  'j': 10,  // A#
  'm': 11,  // B
  ',': 12,  // C (next octave)
  'l': 13,  // C# (next octave)
  '.': 14,  // D (next octave)

  // Upper row — base+1 octave
  'q': 12,  // C
  '2': 13,  // C#
  'w': 14,  // D
  '3': 15,  // D#
  'e': 16,  // E
  'r': 17,  // F
  '5': 18,  // F#
  't': 19,  // G
  '6': 20,  // G#
  'y': 21,  // A
  '7': 22,  // A#
  'u': 23,  // B
  'i': 24,  // C (2 octaves up)
  '9': 25,  // C#
  'o': 26,  // D
  '0': 27,  // D#
  'p': 28,  // E
};

// ─── Utilities ──────────────────────────────────────────────────────────────

/** Build the default keybind map from the action registry */
export function getDefaultKeybindMap(): KeybindMap {
  const map: KeybindMap = {};
  for (const action of KEYBIND_ACTIONS) {
    map[action.id] = [...action.defaultKeys];
  }
  return map;
}

/** Merge user overrides with defaults (overrides take priority) */
export function resolveKeybinds(overrides: KeybindMap): KeybindMap {
  const defaults = getDefaultKeybindMap();
  return { ...defaults, ...overrides };
}

/**
 * Normalize a KeyboardEvent into a binding string like "Ctrl+Shift+Z".
 * Uses Ctrl on all platforms (maps Cmd → Ctrl on macOS).
 */
export function eventToKeyString(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');

  // Normalize the key
  let key = e.key;
  if (key === ' ') key = 'Space';
  if (key.length === 1) key = key.toLowerCase();

  // Don't include modifier keys themselves
  if (!['Control', 'Meta', 'Alt', 'Shift'].includes(e.key)) {
    parts.push(key === ' ' ? 'Space' : key.length === 1 ? key : e.key);
  }

  return parts.join('+');
}

/** Find which action matches a key string, considering typing keyboard state */
export function findActionForKey(
  keyString: string,
  keybindMap: KeybindMap,
  typingKeyboardEnabled: boolean,
): string | null {
  for (const [actionId, keys] of Object.entries(keybindMap)) {
    if (!keys.includes(keyString)) continue;

    // If typing keyboard is on, only allow actions marked allowInTypingKeyboard
    if (typingKeyboardEnabled) {
      const action = KEYBIND_ACTIONS.find(a => a.id === actionId);
      if (action && !action.allowInTypingKeyboard) continue;
    }

    return actionId;
  }
  return null;
}

/** Check for conflicts when rebinding */
export function findConflicts(
  actionId: string,
  newKey: string,
  keybindMap: KeybindMap,
): string[] {
  const conflicts: string[] = [];
  for (const [id, keys] of Object.entries(keybindMap)) {
    if (id !== actionId && keys.includes(newKey)) {
      conflicts.push(id);
    }
  }
  return conflicts;
}

/** Get all keybind actions grouped by category */
export function getKeybindsByCategory(): Record<string, KeybindAction[]> {
  const grouped: Record<string, KeybindAction[]> = {};
  for (const action of KEYBIND_ACTIONS) {
    if (!grouped[action.category]) grouped[action.category] = [];
    grouped[action.category].push(action);
  }
  return grouped;
}
