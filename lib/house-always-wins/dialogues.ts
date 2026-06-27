// ───────────────────────────────────────────────────────────────────────────
// NPC dialogue. Quest-aware: each speaker reads the store snapshot and returns
// the right beat. Choice `action` strings are interpreted by WorldScene.
// ───────────────────────────────────────────────────────────────────────────
import type { DialogueData, NpcId, QuestState } from "./types";

const CLOSE = { text: "(Step away.)", action: "close" };

export function getNpcDialogue(id: NpcId, s: QuestState): DialogueData {
  switch (id) {
    case "dealer":
      return dealer(s);
    case "janitor":
      return janitor(s);
    case "witch":
      return witch(s);
    case "guard":
      return guard(s);
    case "house":
      return house(s);
  }
}

function dealer(s: QuestState): DialogueData {
  if (!s.flags["talkedDealer"]) {
    return {
      id: "dealer_intro",
      lines: [
        { speaker: "The Dealer", text: "Heads you wake, tails you remember. You called it in the air... and here you are again." },
        { speaker: "The Dealer", text: "Welcome back to the Mirage Royale. You owe the House. Everyone here does." },
        { speaker: "The Dealer", text: "Three Vault Keys are scattered through the wings. Bring them, open the Vault, and we'll settle your tab." },
        {
          speaker: "The Dealer",
          text: "The west doors lead to the Poker Hall. Old Marlow keeps it swept. Start there — something of yours is waiting.",
          choices: [
            { text: "What do I owe, exactly?", action: "dealer:debt" },
            { text: "I'll find the keys.", action: "dealer:start" },
          ],
        },
      ],
    };
  }

  const keys = s.keys;
  if (keys >= 3) {
    return {
      id: "dealer_ready",
      lines: [
        { speaker: "The Dealer", text: "Three keys. I'm almost impressed. The Vault door's unlocked — center of the Lobby, the gold one." },
        { speaker: "The Dealer", text: "Last advice, friend: the House doesn't lose. It only changes the wager.", choices: [CLOSE] },
      ],
    };
  }

  const lines: DialogueData["lines"] = [
    {
      speaker: "The Dealer",
      text:
        s.debt > 50
          ? `Your tab's at ${s.debt}. The walls are starting to breathe, aren't they? That's the debt, not the dark.`
          : `You've collected ${keys} of 3 keys. The House is watching the tally.`,
    },
  ];
  const choices: { text: string; action: string }[] = [];
  if (s.chips > 0 && s.debt > 0) {
    choices.push({ text: `Pay down my tab (${Math.min(s.chips, s.debt)} chips)`, action: "dealer:pay" });
  }
  choices.push({ text: "Where to next?", action: "dealer:hint" });
  choices.push(CLOSE);
  lines.push({ speaker: "The Dealer", text: "What'll it be?", choices });
  return { id: "dealer_progress", lines };
}

export function dealerHintLine(s: QuestState): DialogueData {
  let hint = "The top door of the Lobby needs a higher jump. Find the Lucky Coin first.";
  if (s.abilities.doubleJump && !s.abilities.dash)
    hint = "Double-jump to the Lobby's top door. The Slot Vault — and the All-In Dash — wait above.";
  else if (s.abilities.dash && !s.abilities.wallGrip)
    hint = "The east doors open to Security. The Card Grip is in there, behind the lasers.";
  else if (s.abilities.wallGrip)
    hint = "You've got the moves. Now it's just keys. Check the wings you skipped.";
  return { id: "dealer_hintline", lines: [{ speaker: "The Dealer", text: hint, choices: [CLOSE] }] };
}

function janitor(s: QuestState): DialogueData {
  if (!s.flags["key:key1"]) {
    return {
      id: "janitor_hint",
      lines: [
        { speaker: "Marlow, the Janitor", text: "Forty years I've swept this floor. Watched a thousand of you walk in grinning." },
        { speaker: "Marlow, the Janitor", text: "That key up top? Locked behind the old dealing pattern. The cards always fell the same way." },
        {
          speaker: "Marlow, the Janitor",
          text: "Left first. Then far right. Then dead center. Step the plates in that order and the cage opens.",
          choices: [{ text: "Left, right, center. Got it.", action: "close" }],
        },
        { speaker: "Marlow, the Janitor", text: "And if your tab's bleeding you — my table's still warm. Five-card draw. Sometimes the cards give back what the House took.", choices: [CLOSE] },
      ],
    };
  }
  return {
    id: "janitor_done",
    lines: [
      { speaker: "Marlow, the Janitor", text: "Still got my table going, you want to win your tab down. Cards don't care who's desperate.", choices: [CLOSE] },
    ],
  };
}

function witch(s: QuestState): DialogueData {
  if (!s.abilities.dash) {
    return {
      id: "witch_predash",
      lines: [
        { speaker: "Vesper", text: "Mmm. Another debtor, smelling of cheap luck. The reels brought you up here." },
        { speaker: "Vesper", text: "Take the Ace — the All-In Dash. Burst through air, through chip-walls, through hesitation." },
        { speaker: "Vesper", text: "Then the reels. Three of them. Pull the levers till they all show the same face. Three bells pay out, sugar.", choices: [CLOSE] },
      ],
    };
  }
  if (!s.flags["key:key2"]) {
    return {
      id: "witch_puzzle",
      lines: [
        { speaker: "Vesper", text: "Three bells. All three reels, the same bell. The cage drops, the key is yours.", choices: [CLOSE] },
      ],
    };
  }
  return {
    id: "witch_done",
    lines: [{ speaker: "Vesper", text: "Lucky you. Or cursed. With this house the words rhyme.", choices: [CLOSE] }],
  };
}

function guard(s: QuestState): DialogueData {
  if (!s.abilities.wallGrip) {
    return {
      id: "guard_pregrip",
      lines: [
        { speaker: "Chief Doss", text: "Hold it. Nobody clears the vault corridor without the Grip. Cling the walls, climb the shafts." },
        { speaker: "Chief Doss", text: "It's yours — up on the gantry. After that? Lasers. Time the gaps. The camera up top does not blink.", choices: [CLOSE] },
      ],
    };
  }
  if (!s.flags["key:key3"]) {
    return {
      id: "guard_postgrip",
      lines: [
        { speaker: "Chief Doss", text: "Last key's past the beams. Wall-jump the shaft, dash the gaps, stay out of the camera's cone.", choices: [CLOSE] },
      ],
    };
  }
  return {
    id: "guard_done",
    lines: [{ speaker: "Chief Doss", text: "Three keys. I never saw you. Understand? ...Good luck down there.", choices: [CLOSE] }],
  };
}

function house(s: QuestState): DialogueData {
  const canPay = s.chips >= s.debt && s.debt > 0;
  const debtFree = s.debt === 0;
  return {
    id: "house_final",
    lines: [
      { speaker: "THE HOUSE", text: "You climbed. You bled. You brought my own keys back to me. How loyal." },
      { speaker: "THE HOUSE", text: `Your tab stands at ${s.debt}. You hold ${s.chips} chips. So — one last wager, as is tradition.` },
      {
        speaker: "THE HOUSE",
        text: "Settle the debt and walk. Or stake it all on one cut of the deck — double or nothing, your freedom against forever.",
        choices: [
          debtFree
            ? { text: "Walk out clean. You owe nothing.", action: "house:pay" }
            : canPay
              ? { text: `Pay the debt in full (${s.debt} chips) and leave.`, action: "house:pay" }
              : { text: "Pay the debt... (you're short on chips)", action: "house:short" },
          { text: "Cut the deck. All in.", action: "house:gamble" },
          { text: "Refuse to play. Walk out unpaid.", action: "house:refuse" },
        ],
      },
    ],
  };
}
