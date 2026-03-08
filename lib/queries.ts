/**
 * Centralized query key factories for React Query.
 * Using a factory pattern ensures consistent cache invalidation.
 */
export const queryKeys = {
  // Profile
  profile: {
    all: ["profile"] as const,
    me: () => [...queryKeys.profile.all, "me"] as const,
    byId: (id: string) => [...queryKeys.profile.all, id] as const,
    followers: (id: string) => [...queryKeys.profile.all, id, "followers"] as const,
    following: (id: string) => [...queryKeys.profile.all, id, "following"] as const,
  },

  // Games
  leaderboard: {
    all: ["leaderboard"] as const,
    byGame: (gameId: string) => [...queryKeys.leaderboard.all, gameId] as const,
  },

  // User Builds
  builds: {
    all: ["builds"] as const,
    list: (filters?: Record<string, string>) => [...queryKeys.builds.all, "list", filters] as const,
    byId: (id: string) => [...queryKeys.builds.all, id] as const,
  },

  // Feed / Social
  feed: {
    all: ["feed"] as const,
    timeline: () => [...queryKeys.feed.all, "timeline"] as const,
    user: (userId: string) => [...queryKeys.feed.all, "user", userId] as const,
  },

  // Messages
  messages: {
    all: ["messages"] as const,
    conversations: () => [...queryKeys.messages.all, "conversations"] as const,
    byConversation: (id: string) => [...queryKeys.messages.all, id] as const,
    unreadCount: () => [...queryKeys.messages.all, "unread"] as const,
  },

  // Coins
  coins: {
    balance: () => ["coins", "balance"] as const,
  },
} as const;
