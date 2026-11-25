/** The RF_REVEAL payload as the client reads it (see server/rmhbox/minigames/ranking-file/types.ts). */
export interface RFRevealPayload {
  roundIndex: number;
  prompt: string;
  category: string;
  setId: string;
  source: string;
  official: Array<{ label: string; value: number; unit: string }>;
  results: Array<{
    userId: string;
    userName: string;
    order: string[];
    distance: number;
    points: number;
    perfect: boolean;
    locked: boolean;
    newTotalScore: number;
  }>;
}
