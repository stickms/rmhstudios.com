export type NodeType = 'memory' | 'puzzle' | 'void' | 'ending';

export interface StoryNode {
  id: string;
  title: string;
  content: string; // Markdown or Text
  type: NodeType;
  cost: number; // Memory cost to unlock
  entropy: number; // How much this node contributes to entropy (e.g. risk)
  requirements: string[]; // IDs of nodes that must be unlocked first
  choices: Choice[];
  puzzleConfig?: PuzzleConfig;
}

export interface PuzzleConfig {
    type: 'sequence' | 'cipher';
    data: any; // Flexible data for puzzle
    reward: number; // Memories reward
}

export interface GameActions {
    setMemories: (amount: number) => void;
    addMemories: (amount: number) => void;
    spendMemories: (amount: number) => boolean;
    setEntropy: (amount: number) => void;
    increaseEntropy: (amount: number) => void;
    decreaseEntropy: (amount: number) => void;
    unlockNode: (nodeId: string) => void;
    setCurrentTimeline: (nodeId: string) => void;
    setGameOver: (isOver: boolean) => void;
    startGame: () => void;
    resetGame: () => void;
}

export interface Choice {
  id: string;
  text: string;
  nextNodeId: string;
  cost?: number;
  effect?: (state: GameState & GameActions) => void; // Side effects
}

export interface GameState {
  memories: number; // Currency
  entropy: number; // Decay meter (0-100)
  unlockedNodes: string[]; // History of visited nodes
  currentTimeline: string; // Current Node ID
  isGameOver: boolean;
  gameStarted: boolean; // Tracking if game is active
}
