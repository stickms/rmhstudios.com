import { TILE_SIZE } from "../constants";
import type { LevelData } from "../types";

const grid = [
  "#########################",
  "#.......................#",
  "#.......................#",
  "#.......................#",
  "#.......................#",
  "#.......................#",
  "#.......................#",
  "#.......####............#",
  "#.......................#",
  "#.......................#",
  "#...............####....#",
  "#.......................#",
  "#..####.................#",
  "#.......................#",
  "#.......................#",
  "#.......................#",
  "#..P.......D........X..#",
  "##########.###.#########",
];

export function parseLobby(): LevelData {
  let spawn = { x: 0, y: 0 };
  const npcs: LevelData["npcs"] = [];
  const exits: LevelData["exits"] = [];

  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < grid[row].length; col++) {
      const ch = grid[row][col];
      if (ch === "P") {
        spawn = { x: col * TILE_SIZE, y: (row - 1) * TILE_SIZE };
      } else if (ch === "D") {
        npcs.push({
          x: col * TILE_SIZE,
          y: (row - 1) * TILE_SIZE,
          w: TILE_SIZE,
          h: TILE_SIZE * 2,
          id: "dealer",
          dialogueKey: "dealer",
        });
      } else if (ch === "X") {
        exits.push({
          x: col * TILE_SIZE,
          y: row * TILE_SIZE,
          w: TILE_SIZE,
          h: TILE_SIZE,
        });
      }
    }
  }

  return { grid, spawn, npcs, exits, hazards: [], detectionZones: [] };
}
