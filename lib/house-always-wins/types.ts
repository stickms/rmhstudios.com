export interface Vec2 {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type SceneName = "lobby" | "dealerEvent" | "securityEvent";

export interface SceneTransition {
  to: SceneName;
  payload?: {
    result?: "success" | "fail";
    from?: string;
  };
}

export interface DialogueChoice {
  text: string;
  action: string;
}

export interface DialogueLine {
  speaker: string;
  text: string;
  choices?: DialogueChoice[];
}

export interface DialogueData {
  id: string;
  lines: DialogueLine[];
}

export interface NPC {
  x: number;
  y: number;
  w: number;
  h: number;
  id: string;
  dialogueKey: string;
}

export interface LevelData {
  grid: string[];
  spawn: Vec2;
  npcs: NPC[];
  exits: Rect[];
  hazards: Rect[];
  detectionZones: Rect[];
}
