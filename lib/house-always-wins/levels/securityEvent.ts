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
  "#.....SSS...............#",
  "#.....SSS...............#",
  "#...............SSS.....#",
  "#...............SSS.....#",
  "#.......................#",
  "#...........SSS.........#",
  "#...........SSS.........#",
  "#.......................#",
  "#.......................#",
  "#.P...................X.#",
  "##.######.#####.######.#",
];

export function parseSecurityEvent(): LevelData {
  let spawn = { x: 0, y: 0 };
  const exits: LevelData["exits"] = [];
  const detectionZones: LevelData["detectionZones"] = [];
  const visited = new Set<string>();

  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < grid[row].length; col++) {
      const ch = grid[row][col];
      if (ch === "P") {
        spawn = { x: col * TILE_SIZE, y: (row - 1) * TILE_SIZE };
      } else if (ch === "X") {
        exits.push({
          x: col * TILE_SIZE,
          y: row * TILE_SIZE,
          w: TILE_SIZE,
          h: TILE_SIZE,
        });
      } else if (ch === "S" && !visited.has(`${col},${row}`)) {
        let w = 0;
        let h = 0;
        while (col + w < grid[row].length && grid[row][col + w] === "S") w++;
        while (row + h < grid.length && grid[row + h]?.[col] === "S") h++;
        for (let dy = 0; dy < h; dy++) {
          for (let dx = 0; dx < w; dx++) {
            visited.add(`${col + dx},${row + dy}`);
          }
        }
        detectionZones.push({
          x: col * TILE_SIZE,
          y: row * TILE_SIZE,
          w: w * TILE_SIZE,
          h: h * TILE_SIZE,
        });
      }
    }
  }

  return { grid, spawn, npcs: [], exits, hazards: [], detectionZones };
}
