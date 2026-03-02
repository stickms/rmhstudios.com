/**
 * Athora — Zustand Store
 *
 * Central state management for the Athora spatial networking platform.
 */

import { create } from "zustand";
import type {
  RoomConfig,
  RoomUserPayload,
  StandPayload,
  ConversationPayload,
  AthoraAvailability,
  ProximityMsgPayload,
  ConversationMsgPayload,
} from "@/types/athora";

interface RoomUser {
  id: string;
  name: string;
  image: string | null;
  x: number;
  y: number;
  facing: string;
  availability: string;
  interestTags: string[];
}

interface AthoraState {
  // Room info
  currentRoom: RoomConfig | null;
  users: Map<string, RoomUser>;
  stands: StandPayload[];
  conversations: ConversationPayload[];

  // My state
  myPosition: { x: number; y: number };
  myAvailability: AthoraAvailability;
  activeConversationId: string | null;
  viewingStandId: string | null;

  // Chat
  proximityMessages: ProximityMsgPayload[];
  conversationMessages: Map<string, ConversationMsgPayload[]>;

  // Actions
  setRoom: (room: RoomConfig) => void;
  addUser: (user: RoomUserPayload) => void;
  removeUser: (userId: string) => void;
  updateUserPosition: (
    userId: string,
    x: number,
    y: number,
    facing: string
  ) => void;
  setMyPosition: (x: number, y: number) => void;
  setMyAvailability: (availability: AthoraAvailability) => void;
  setActiveConversation: (id: string | null) => void;
  setViewingStand: (id: string | null) => void;
  addConversation: (conv: ConversationPayload) => void;
  removeConversation: (convId: string) => void;
  updateConversationMembers: (
    convId: string,
    members: ConversationPayload["members"]
  ) => void;
  addProximityMessage: (msg: ProximityMsgPayload) => void;
  addConversationMessage: (msg: ConversationMsgPayload) => void;
  setStands: (stands: StandPayload[]) => void;
  reset: () => void;
}

const MAX_PROXIMITY_MESSAGES = 100;

export const useAthoraStore = create<AthoraState>((set) => ({
  currentRoom: null,
  users: new Map(),
  stands: [],
  conversations: [],
  myPosition: { x: 0, y: 0 },
  myAvailability: "OPEN_TO_CHAT",
  activeConversationId: null,
  viewingStandId: null,
  proximityMessages: [],
  conversationMessages: new Map(),

  setRoom: (room) => set({ currentRoom: room }),

  addUser: (user) =>
    set((state) => {
      const users = new Map(state.users);
      users.set(user.id, {
        id: user.id,
        name: user.name,
        image: user.image,
        x: user.x,
        y: user.y,
        facing: user.facing,
        availability: user.availability,
        interestTags: user.interestTags,
      });
      return { users };
    }),

  removeUser: (userId) =>
    set((state) => {
      const users = new Map(state.users);
      users.delete(userId);
      return { users };
    }),

  updateUserPosition: (userId, x, y, facing) =>
    set((state) => {
      const users = new Map(state.users);
      const user = users.get(userId);
      if (user) {
        users.set(userId, { ...user, x, y, facing });
      }
      return { users };
    }),

  setMyPosition: (x, y) => set({ myPosition: { x, y } }),

  setMyAvailability: (availability) => set({ myAvailability: availability }),

  setActiveConversation: (id) => set({ activeConversationId: id }),

  setViewingStand: (id) => set({ viewingStandId: id }),

  addConversation: (conv) =>
    set((state) => ({
      conversations: [...state.conversations, conv],
    })),

  removeConversation: (convId) =>
    set((state) => ({
      conversations: state.conversations.filter((c) => c.id !== convId),
    })),

  updateConversationMembers: (convId, members) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === convId ? { ...c, members } : c
      ),
    })),

  addProximityMessage: (msg) =>
    set((state) => ({
      proximityMessages: [
        ...state.proximityMessages.slice(-MAX_PROXIMITY_MESSAGES + 1),
        msg,
      ],
    })),

  addConversationMessage: (msg) =>
    set((state) => {
      const messages = new Map(state.conversationMessages);
      const existing = messages.get(msg.conversationId) || [];
      messages.set(msg.conversationId, [...existing, msg]);
      return { conversationMessages: messages };
    }),

  setStands: (stands) => set({ stands }),

  reset: () =>
    set({
      currentRoom: null,
      users: new Map(),
      stands: [],
      conversations: [],
      activeConversationId: null,
      viewingStandId: null,
      proximityMessages: [],
      conversationMessages: new Map(),
    }),
}));
