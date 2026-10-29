/**
 * Bots (docs/tf2-game.md "Bots"): navigation mesh generation and
 * `nav.bin` (./nav), A* and path following that produce user commands
 * (./path.ts), and the TFBot brain (./brain) the match host plays its bots
 * with. Environment-agnostic and deterministic.
 */

export * from './nav';
export * from './path';
export * from './brain';
