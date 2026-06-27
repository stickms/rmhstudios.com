// ───────────────────────────────────────────────────────────────────────────
// The casino map. Six interconnected rooms wired together by doors. Each room
// is an ASCII interior that buildRoom() pads to a rectangle and wraps in a
// solid border, so the layouts below stay easy to read and edit.
//
// Tile legend:  # solid   - one-way platform   ^ floor spike   v ceiling spike
//               x crumbling chip-stack   % dash-breakable chip wall
//               f felt backing (deco)    s slot machine (deco)   . empty
//
// Doors, NPCs and entities are placed by (col,row) in the *padded* grid, so
// keep an eye on widths. validateRooms() (scripts) checks every reference.
// ───────────────────────────────────────────────────────────────────────────
import type { RoomData, RoomId } from "../types";

function buildRoom(rows: string[]): string[] {
  const width = Math.max(...rows.map((r) => r.length));
  const padded = rows.map((r) => r.padEnd(width, "."));
  const h = padded.length;
  return padded.map((r, y) => {
    let line = r;
    // force left/right border
    line = "#" + line.slice(1, width - 1) + "#";
    if (y === 0 || y === h - 1) line = "#".repeat(width);
    return line;
  });
}

// ── LOBBY ─────────────────────────────────────────────────────────────────────
// Central hub. Left → Poker Hall, right → Security Wing, top → Slot Vault
// (needs the double jump), and the gold Vault door (needs 3 keys).
const lobby = buildRoom([
  "###################################",
  "#.................................#",
  "#....f.f.f...........s...s...s....#",
  "#................................ #",
  "#.........------........----.....#",
  "#................................#",
  "#...----.............-----.......#",
  "#................###..............#",
  "#.......###.................###...#",
  "#................................#",
  "#....----......------......----..#",
  "#................................#",
  "#......................%%%........#",
  "#####............................#",
  "#####...........###....###.......#",
  "###################################",
]);

// ── POKER HALL ─────────────────────────────────────────────────────────────────
// Janitor lives here. The Lucky Coin (double jump) is mid-room; the vault key
// sits behind a pressure-plate sequence puzzle up top.
const pokerHall = buildRoom([
  "##########################################",
  "#........................................#",
  "#..f.f.f.................................#",
  "#............----........######..........#",
  "#.......................................#",
  "#...###.........----...............---..#",
  "#......................^^^^..............#",
  "#..........####....########....####......#",
  "#.....................................#",
  "#................---.........---.........#",
  "#......xxxx..............................#",
  "#..###......###....----........----......#",
  "#.....................................#",
  "#.........----......^^^^......----.......#",
  "#...####..........#######..........###...#",
  "#.....................................#",
  "#....f....................f..............#",
  "#..####.........----.........----........#",
  "#.....................................#",
  "#..........###.........###.........###...#",
  "#........................................#",
  "##########################################",
]);

// ── SLOT VAULT ─────────────────────────────────────────────────────────────────
// Slot-Witch's domain. The All-In Dash relic is here. A 3-reel slot puzzle
// (three levers) opens the key cage. Dash-breakable chip walls everywhere.
const slotVault = buildRoom([
  "######################################",
  "#....................................#",
  "#...s....s....s....s....s....s....s..#",
  "#....................................#",
  "#......----.......%%%.......----.....#",
  "#....................................#",
  "#..###.................%%%.......###.#",
  "#....................................#",
  "#.......----.....----.....----.......#",
  "#....................................#",
  "#...%%%......................%%%......#",
  "#.......###...............###........#",
  "#....................................#",
  "#......----.....------.....----......#",
  "#....................................#",
  "#..###..............................##",
  "#..........----........----..........#",
  "#....................................#",
  "#####......................#####.....#",
  "######################################",
]);

// ── SECURITY WING ──────────────────────────────────────────────────────────────
// Guard's beat. Lasers, moving platforms and a camera. The Card Grip (wall
// climb) relic is here; the third vault key is past the laser corridor.
const securityWing = buildRoom([
  "##############################################",
  "#............................................#",
  "#....----........###........----.............#",
  "#...........................................#",
  "#..###.........----.....----.........###.....#",
  "#...........................................#",
  "#........###..................###...........#",
  "#...........................................#",
  "#....----.........%%%%%.........----.........#",
  "#...........................................#",
  "#..###...............................###.....#",
  "#...........................................#",
  "#........----..................----.........#",
  "#####....................................#####",
  "#####..........#####....#####............#####",
  "##############################################",
]);

// ── MAINTENANCE SHAFT ──────────────────────────────────────────────────────────
// A tall vertical shortcut spine. Needs the Card Grip to climb. Links the
// Poker Hall and Security Wing back to the Lobby once opened.
const maintenance = buildRoom([
  "##################",
  "#................#",
  "#....----........#",
  "#................#",
  "#........----....#",
  "#................#",
  "#..----..........#",
  "#................#",
  "#..........----..#",
  "#................#",
  "#....----........#",
  "#................#",
  "#..........----..#",
  "#................#",
  "#..----..........#",
  "#................#",
  "#........----....#",
  "#................#",
  "#..----..........#",
  "#................#",
  "#..........----..#",
  "#................#",
  "#....----........#",
  "#................#",
  "#........###.....#",
  "##################",
]);

// ── THE VAULT ───────────────────────────────────────────────────────────────────
// The House waits. A final gauntlet, then the confrontation and endings.
const vault = buildRoom([
  "##################################",
  "#................................#",
  "#................................#",
  "#......----..........----........#",
  "#................................#",
  "#...###....................###...#",
  "#................................#",
  "#.......----..........----.......#",
  "#................................#",
  "#..###........................##.#",
  "#................................#",
  "#......----..........----........#",
  "#................................#",
  "#####........................#####",
  "#####..........####..........#####",
  "##################################",
]);

export const ROOMS: Record<RoomId, RoomData> = {
  lobby: {
    id: "lobby",
    name: "The Lobby",
    music: "lobby",
    theme: "lobby",
    grid: lobby,
    doors: [
      { id: "toPoker", col: 1, row: 12, to: "pokerHall", toDoor: "fromLobby", facing: "left" },
      { id: "toSecurity", col: 33, row: 12, to: "securityWing", toDoor: "fromLobby", facing: "right" },
      { id: "toSlots", col: 17, row: 5, to: "slotVault", toDoor: "fromLobby", lockedByAbility: "doubleJump", facing: "right" },
      { id: "toVault", col: 23, row: 11, to: "vault", toDoor: "fromLobby", lockedByKey: 3, facing: "right" },
      { id: "spawn", col: 6, row: 12, to: "lobby", toDoor: "spawn" },
    ],
    npcs: [{ id: "dealer", col: 16, row: 12, facing: "left" }],
    entities: [
      { kind: "save", id: "lobbySave", col: 9, row: 12 },
      { kind: "sign", id: "lobbySign1", col: 4, row: 12, text: "lobbySign" },
      { kind: "chip", id: "lc1", col: 12, row: 9 },
      { kind: "chip", id: "lc2", col: 27, row: 9 },
      { kind: "chip", id: "lc3", col: 20, row: 5 },
    ],
  },

  pokerHall: {
    id: "pokerHall",
    name: "Poker Hall",
    music: "tense",
    theme: "poker",
    grid: pokerHall,
    doors: [
      { id: "fromLobby", col: 40, row: 18, to: "lobby", toDoor: "toPoker", facing: "right" },
      { id: "toMaint", col: 1, row: 18, to: "maintenance", toDoor: "fromPoker", lockedByAbility: "wallGrip", facing: "left" },
    ],
    npcs: [{ id: "janitor", col: 36, row: 18, facing: "left" }],
    entities: [
      { kind: "sign", id: "pokerSign", col: 33, row: 18, text: "pokerSign" },
      // Heads-up five-card draw vs the house — gamble your tab down (or deeper).
      { kind: "pokerTable", id: "pokerTable", col: 16, row: 19 },
      // The Lucky Coin — double jump, reachable with base jumps.
      { kind: "ability", id: "abDouble", ability: "doubleJump", col: 20, row: 8 },
      // Pressure-plate sequence puzzle (top) → opens key cage.
      { kind: "plate", id: "pp1", col: 8, row: 4, group: "pokerSeq", target: 0 },
      { kind: "plate", id: "pp2", col: 30, row: 4, group: "pokerSeq", target: 1 },
      { kind: "plate", id: "pp3", col: 19, row: 4, group: "pokerSeq", target: 2 },
      { kind: "key", id: "key1", col: 20, row: 3, group: "pokerSeq" },
      { kind: "chip", id: "pc1", col: 7, row: 9 },
      { kind: "chip", id: "pc2", col: 12, row: 13 },
      { kind: "chip", id: "pc3", col: 27, row: 13 },
      { kind: "chip", id: "pc4", col: 5, row: 4 },
      { kind: "chip", id: "pc5", col: 34, row: 10 },
    ],
  },

  slotVault: {
    id: "slotVault",
    name: "Slot Vault",
    music: "tense",
    theme: "slots",
    grid: slotVault,
    doors: [
      { id: "fromLobby", col: 36, row: 16, to: "lobby", toDoor: "toSlots", facing: "right" },
    ],
    npcs: [{ id: "witch", col: 5, row: 16, facing: "right" }],
    entities: [
      { kind: "sign", id: "slotSign", col: 8, row: 16, text: "slotSign" },
      // All-In Dash relic.
      { kind: "ability", id: "abDash", ability: "dash", col: 18, row: 13 },
      // Slot puzzle: three levers cycle three reels; match target to open cage.
      { kind: "lever", id: "lv1", col: 6, row: 16, group: "reel1" },
      { kind: "lever", id: "lv2", col: 18, row: 16, group: "reel2" },
      { kind: "lever", id: "lv3", col: 30, row: 16, group: "reel3" },
      { kind: "slotReel", id: "reel1", col: 9, row: 10, target: 0 },
      { kind: "slotReel", id: "reel2", col: 18, row: 10, target: 0 },
      { kind: "slotReel", id: "reel3", col: 27, row: 10, target: 0 },
      { kind: "key", id: "key2", col: 18, row: 4, group: "slotPuzzle" },
      { kind: "chip", id: "sc1", col: 6, row: 4 },
      { kind: "chip", id: "sc2", col: 31, row: 4 },
      { kind: "chip", id: "sc3", col: 18, row: 8 },
      { kind: "chip", id: "sc4", col: 4, row: 13 },
    ],
  },

  securityWing: {
    id: "securityWing",
    name: "Security Wing",
    music: "tense",
    theme: "security",
    grid: securityWing,
    doors: [
      { id: "fromLobby", col: 1, row: 12, to: "lobby", toDoor: "toSecurity", facing: "left" },
      { id: "toMaint", col: 44, row: 12, to: "maintenance", toDoor: "fromSecurity", lockedByAbility: "wallGrip", facing: "right" },
    ],
    npcs: [{ id: "guard", col: 6, row: 12, facing: "right" }],
    entities: [
      { kind: "sign", id: "secSign", col: 9, row: 12, text: "secSign" },
      // Card Grip relic.
      { kind: "ability", id: "abGrip", ability: "wallGrip", col: 22, row: 7 },
      // Lasers (blink) guarding the key corridor.
      { kind: "laser", id: "lz1", col: 14, row: 9, vertical: true, length: 4, onTime: 1.2, offTime: 1.0, phase: 0 },
      { kind: "laser", id: "lz2", col: 24, row: 5, vertical: false, length: 5, onTime: 1.0, offTime: 1.1, phase: 0.5 },
      { kind: "laser", id: "lz3", col: 31, row: 9, vertical: true, length: 4, onTime: 1.3, offTime: 0.9, phase: 0.9 },
      // Moving platform across a gap.
      { kind: "mover", id: "mv1", col: 18, row: 13, dx: 0, dy: -5, speed: 26, length: 3 },
      { kind: "camera", id: "cam1", col: 22, row: 2 },
      { kind: "key", id: "key3", col: 41, row: 4 },
      { kind: "chip", id: "ec1", col: 4, row: 2 },
      { kind: "chip", id: "ec2", col: 40, row: 2 },
      { kind: "chip", id: "ec3", col: 22, row: 11 },
    ],
  },

  maintenance: {
    id: "maintenance",
    name: "Maintenance Shaft",
    music: "tense",
    theme: "maintenance",
    grid: maintenance,
    doors: [
      { id: "fromPoker", col: 1, row: 22, to: "pokerHall", toDoor: "toMaint", facing: "left" },
      { id: "fromSecurity", col: 16, row: 3, to: "securityWing", toDoor: "toMaint", facing: "right" },
      { id: "toLobby", col: 8, row: 23, to: "lobby", toDoor: "spawn", facing: "right" },
    ],
    npcs: [],
    entities: [
      { kind: "save", id: "maintSave", col: 8, row: 23 },
      { kind: "chip", id: "mc1", col: 5, row: 6 },
      { kind: "chip", id: "mc2", col: 11, row: 12 },
      { kind: "chip", id: "mc3", col: 4, row: 18 },
      { kind: "chip", id: "mc4", col: 11, row: 20 },
    ],
  },

  vault: {
    id: "vault",
    name: "The Vault",
    music: "vault",
    theme: "vault",
    grid: vault,
    doors: [
      { id: "fromLobby", col: 1, row: 12, to: "lobby", toDoor: "toVault", facing: "left" },
    ],
    npcs: [{ id: "house", col: 16, row: 12, facing: "left" }],
    entities: [
      { kind: "vaultCore", id: "core", col: 15, row: 1 },
      { kind: "save", id: "vaultSave", col: 4, row: 12 },
      { kind: "chip", id: "vc1", col: 9, row: 7 },
      { kind: "chip", id: "vc2", col: 24, row: 7 },
    ],
  },
};

export const SPRITE_ANCHOR_NOTE = "Entity col/row are tile coordinates in the padded grid.";
