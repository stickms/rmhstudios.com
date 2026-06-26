// ============================================================
// BREAKPOINT — Zustand store (menus, agent pick, lobby, config)
// The live match runs in an imperative engine (engine/world.ts);
// the HUD polls it. This store holds everything *around* the match.
// ============================================================
import { create } from 'zustand';
import type { GamePhase, LobbyMember, Team } from './types';
import { AGENTS } from './agents';

const BOT_NAMES = [
  'gracepenguinator', 'Asao', 'drooooooo', 'gamecube', 'Kimmy', 'grape1617',
  'PizzaWaffleVT', 'Mahmoud', 'Andrew', 'shivam', 'NomNomFan', 'Empress', 'zzz', 'icy',
];

export interface MatchConfig {
  localAgentId: string;
  teamSize: number;        // 1..5 per side
  localTeam: Team;
  botDifficulty: number;   // 0..1
  allies: { name: string; agentId: string }[];
  enemies: { name: string; agentId: string }[];
}

interface BreakpointStore {
  phase: GamePhase;
  setPhase: (p: GamePhase) => void;

  selectedAgent: string;
  setSelectedAgent: (id: string) => void;

  teamSize: number; // chosen squad size 1..5
  setTeamSize: (n: number) => void;

  botDifficulty: number;
  setBotDifficulty: (d: number) => void;

  // Lobby (party) — local-first; networked lobby overrides these
  lobby: LobbyMember[];
  partyCode: string;
  inQueue: boolean;
  setInQueue: (q: boolean) => void;
  setLobby: (m: LobbyMember[]) => void;
  toggleReady: (id: string) => void;

  matchConfig: MatchConfig | null;
  buildMatchConfig: () => MatchConfig;

  // result carryover
  lastWinner: Team | null;
  lastScore: { att: number; def: number };
  setResult: (winner: Team | null, att: number, def: number) => void;

  reset: () => void;
}

function makeLocalLobby(agentId: string): LobbyMember[] {
  return [
    { id: 'local', name: 'You', agentId, ready: false, isHost: true, isBot: false, rank: 168 },
  ];
}

export const useBreakpointStore = create<BreakpointStore>((set, get) => ({
  phase: 'menu',
  setPhase: (p) => set({ phase: p }),

  selectedAgent: AGENTS[0].id,
  setSelectedAgent: (id) => set((s) => ({
    selectedAgent: id,
    lobby: s.lobby.map((m) => (m.id === 'local' ? { ...m, agentId: id } : m)),
  })),

  teamSize: 5,
  setTeamSize: (n) => set({ teamSize: Math.max(1, Math.min(5, n)) }),

  botDifficulty: 0.6,
  setBotDifficulty: (d) => set({ botDifficulty: Math.max(0, Math.min(1, d)) }),

  lobby: makeLocalLobby(AGENTS[0].id),
  partyCode: Math.random().toString(36).slice(2, 8).toUpperCase(),
  inQueue: false,
  setInQueue: (q) => set({ inQueue: q }),
  setLobby: (m) => set({ lobby: m }),
  toggleReady: (id) => set((s) => ({
    lobby: s.lobby.map((m) => (m.id === id ? { ...m, ready: !m.ready } : m)),
  })),

  matchConfig: null,
  buildMatchConfig: () => {
    const s = get();
    const localTeam: Team = 'attackers';
    // Squad = local + (teamSize-1) party/bot allies
    const partyAllies = s.lobby.filter((m) => m.id !== 'local');
    const usedAgents = new Set<string>([s.selectedAgent]);
    const pickAgent = () => {
      const pool = AGENTS.filter((a) => !usedAgents.has(a.id));
      const a = (pool.length ? pool : AGENTS)[Math.floor(Math.random() * (pool.length || AGENTS.length))];
      usedAgents.add(a.id);
      return a.id;
    };
    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    let ni = 0;

    const allies: { name: string; agentId: string }[] = [];
    for (let i = 0; i < s.teamSize - 1; i++) {
      const p = partyAllies[i];
      allies.push({
        name: p ? p.name : (names[ni++] ?? `Ally${i}`),
        agentId: p?.agentId ?? pickAgent(),
      });
    }
    const enemies: { name: string; agentId: string }[] = [];
    for (let i = 0; i < s.teamSize; i++) {
      enemies.push({ name: names[ni++] ?? `Enemy${i}`, agentId: pickAgent() });
    }

    const config: MatchConfig = {
      localAgentId: s.selectedAgent,
      teamSize: s.teamSize,
      localTeam,
      botDifficulty: s.botDifficulty,
      allies,
      enemies,
    };
    set({ matchConfig: config });
    return config;
  },

  lastWinner: null,
  lastScore: { att: 0, def: 0 },
  setResult: (winner, att, def) => set({ lastWinner: winner, lastScore: { att, def } }),

  reset: () => set((s) => ({
    phase: 'menu',
    inQueue: false,
    lobby: makeLocalLobby(s.selectedAgent),
  })),
}));

export { BOT_NAMES };
