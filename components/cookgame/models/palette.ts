export const PALETTE = {
  asphalt: '#3f4146',
  sidewalk: '#9a9690',
  grass: '#6f8f4e',
  stucco: '#cdbfa6',
  sidingA: '#8a9aa3',
  sidingB: '#b0a48f',
  roof: '#5c4633',
  wood: '#7a5a3a',
  accent: '#e05a2b',
  metal: '#8d9499',
  foliage: '#4d7a43',
  soil: '#4a3727',
  skyTop: '#9ec7e8',
  skyBottom: '#dce9f2',
  lamp: '#ddd8c0',
  roadMark: '#e8e0c0',
  wall: '#374151',
} as const;

export function matteMaterialProps(color: string) {
  return { color, roughness: 0.85, metalness: 0.05 };
}

export interface CharacterLook {
  id: string;
  skin: string;
  hair: string;
  top: string;
  bottom: string;
  shoes: string;
  accent: string;
  cap: boolean;
}

export const CHARACTER_LOOKS: Record<string, CharacterLook> = {
  player: {
    id: 'player',
    skin: '#c79a73',
    hair: '#2b2118',
    top: '#3b6e4f',
    bottom: '#2f3540',
    shoes: '#1c1c1c',
    accent: '#d8a657',
    cap: true,
  },
  doug: {
    id: 'doug',
    skin: '#caa17d',
    hair: '#6b4a2b',
    top: '#9c4a3b',
    bottom: '#41434a',
    shoes: '#2a2a2a',
    accent: '#e0c08a',
    cap: false,
  },
  kim: {
    id: 'kim',
    skin: '#b98a64',
    hair: '#1f1a16',
    top: '#5566a8',
    bottom: '#33363d',
    shoes: '#3a2f2a',
    accent: '#d2d6dd',
    cap: false,
  },
  pablo: {
    id: 'pablo',
    skin: '#a9794f',
    hair: '#11100e',
    top: '#6f5aa0',
    bottom: '#2b2e34',
    shoes: '#222222',
    accent: '#caa84e',
    cap: true,
  },
};

export function getCharacterLook(id: string): CharacterLook {
  return CHARACTER_LOOKS[id] ?? CHARACTER_LOOKS.player;
}
