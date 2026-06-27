// Objective chain. The HUD surfaces the first incomplete, non-hidden objective.
import type { Objective, QuestState } from "./types";

export const OBJECTIVES: Objective[] = [
  {
    id: "meetDealer",
    text: "Find the Dealer and learn the rules of the house.",
    done: (s) => !!s.flags["talkedDealer"],
  },
  {
    id: "luckyCoin",
    text: "Take the Lucky Coin from the Poker Hall (west door).",
    done: (s) => s.abilities.doubleJump,
  },
  {
    id: "key1",
    text: "Win a Vault Key — solve the Poker Hall's card sequence.",
    done: (s) => !!s.flags["key:key1"],
  },
  {
    id: "dash",
    text: "Double-jump to the Slot Vault (top door) and grab the All-In Dash.",
    done: (s) => s.abilities.dash,
  },
  {
    id: "key2",
    text: "Win a Vault Key — line up the reels in the Slot Vault.",
    done: (s) => !!s.flags["key:key2"],
  },
  {
    id: "grip",
    text: "Find the Card Grip in the Security Wing (east door).",
    done: (s) => s.abilities.wallGrip,
  },
  {
    id: "key3",
    text: "Win the last Vault Key past the Security lasers.",
    done: (s) => !!s.flags["key:key3"],
  },
  {
    id: "vault",
    text: "Three keys in hand — open the Vault and face The House.",
    done: (s) => !!s.flags["ending"],
  },
];

export function currentObjective(s: QuestState): { text: string; index: number; total: number } {
  const visible = OBJECTIVES.filter((o) => !o.hidden?.(s));
  for (let i = 0; i < visible.length; i++) {
    if (!visible[i].done(s)) {
      return { text: visible[i].text, index: i, total: visible.length };
    }
  }
  return { text: "Escape the Mirage Royale. You're free.", index: visible.length, total: visible.length };
}
