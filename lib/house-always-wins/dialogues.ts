import type { DialogueData } from "./types";

export function getDealerDialogue(debt: number, flags: Record<string, boolean>): DialogueData {
  const dealerDone = flags["dealer_completed"] ?? false;
  const securityDone = flags["security_completed"] ?? false;

  if (securityDone) {
    return {
      id: "dealer_postgame",
      lines: [
        {
          speaker: "Dealer",
          text: "You've been through both wings. Impressive. Or desperate.",
        },
        {
          speaker: "Dealer",
          text: debt > 0
            ? `Your debt stands at ${debt}. The house always collects.`
            : "Clean slate. For now. The house is patient.",
          choices: [
            { text: "Run the Dealer's room again.", action: "go_dealer" },
            { text: "Try Security again.", action: "go_security" },
            { text: "Walk away.", action: "close" },
          ],
        },
      ],
    };
  }

  if (dealerDone) {
    return {
      id: "dealer_after_event",
      lines: [
        {
          speaker: "Dealer",
          text: debt >= 10
            ? "Rough run. The house remembers. There's a security wing down the hall..."
            : "Not bad. But the real test is the security wing.",
          choices: [
            { text: "I'll try the security wing.", action: "go_security" },
            { text: "Run your gauntlet again.", action: "go_dealer" },
            { text: "Not yet.", action: "close" },
          ],
        },
      ],
    };
  }

  return {
    id: "dealer_initial",
    lines: [
      {
        speaker: "Dealer",
        text: "Welcome to the floor. Care to make a wager?",
      },
      {
        speaker: "Dealer",
        text: "Run my little gauntlet. Reach the end, and you owe nothing. Fail... and the debt begins.",
        choices: [
          { text: "Take the deal.", action: "go_dealer" },
          { text: "Not yet.", action: "close" },
        ],
      },
    ],
  };
}
