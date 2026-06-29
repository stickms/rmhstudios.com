export interface DeskMode {
  id: string;
  title: string;
  emoji: string;
  descriptionKey: string;
  descriptionDefault: string;
  /** Hex accent for the 3D clipping's emissive/glow. */
  accent: string;
}

export const DESK_MODES: DeskMode[] = [
  { id: 'lights-out', title: 'Lights Out', emoji: '🔦', descriptionKey: 'lights-out-desc', descriptionDefault: 'Turn off every light. Tap to toggle neighbors.', accent: '#e0a73a' },
  { id: 'alibi', title: 'Alibi', emoji: '🔍', descriptionKey: 'alibi-desc', descriptionDefault: 'Four suspects. One liar. Find the contradiction.', accent: '#e0563a' },
  { id: 'spectrum', title: 'Spectrum', emoji: '🌈', descriptionKey: 'spectrum-desc', descriptionDefault: 'Rank 5 items along a hidden scale.', accent: '#9b6cff' },
  { id: 'outcast', title: 'Outcast', emoji: '🎭', descriptionKey: 'outcast-desc', descriptionDefault: 'Five rounds. Spot the odd one out.', accent: '#36c2a4' },
  { id: 'chainlink', title: 'Chainlink', emoji: '🔗', descriptionKey: 'chainlink-desc', descriptionDefault: 'Connect two words through association jumps.', accent: '#3aa0e0' },
  { id: 'impostor', title: 'Impostor', emoji: '🤥', descriptionKey: 'impostor-desc', descriptionDefault: 'Five facts. Two are lies. Find the fakes.', accent: '#d9c23a' },
];

export function modeById(id: string): DeskMode | undefined {
  return DESK_MODES.find((m) => m.id === id);
}
