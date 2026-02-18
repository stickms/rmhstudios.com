import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Achievement {
    id: string;
    title: string;
    description: string;
    icon: string; // emoji
    category: 'story' | 'exploration' | 'combat' | 'dialogue' | 'secret' | 'survival';
    points: number;
    unlockedAt?: number;
}

interface AchievementState {
    unlocked: Record<string, number>; // id -> timestamp
    recentlyUnlocked: Achievement | null;
    unlock: (id: string) => void;
    clearRecent: () => void;
    isUnlocked: (id: string) => boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// ACHIEVEMENT DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────
export const ACHIEVEMENTS: Achievement[] = [
    // ── STORY ──────────────────────────────────────────────────────────────
    { id: 'first_breath', title: 'First Breath', description: 'Wake up in Outpost 13.', icon: '🌑', category: 'story', points: 10 },
    { id: 'meet_elara', title: 'Familiar Stranger', description: 'Speak with Elara for the first time.', icon: '👤', category: 'story', points: 15 },
    { id: 'take_weapon', title: 'Armed and Dangerous', description: 'Accept Elara\'s pistol.', icon: '🔫', category: 'story', points: 20 },
    { id: 'examine_terminal', title: 'Ghost in the Machine', description: 'Access the corrupted terminal.', icon: '💻', category: 'story', points: 15 },
    { id: 'kael_mention', title: 'Who is Kael?', description: 'Discover the name Kael in the logs.', icon: '❓', category: 'story', points: 25 },
    { id: 'outpost_explored', title: 'Cartographer', description: 'Explore every room of Outpost 13.', icon: '🗺️', category: 'exploration', points: 30 },
    { id: 'first_echo', title: 'Echo Chamber', description: 'Encounter your first Echo entity.', icon: '👁️', category: 'story', points: 20 },
    { id: 'signal_found', title: 'Phantom Signal', description: 'Trace the source of the distress signal.', icon: '📡', category: 'story', points: 40 },
    { id: 'chapter1_complete', title: 'The Phantom Signal', description: 'Complete Chapter 1.', icon: '📖', category: 'story', points: 100 },

    // ── DIALOGUE ───────────────────────────────────────────────────────────
    { id: 'elara_trust', title: 'Trust Issues', description: 'Choose to trust Elara completely.', icon: '🤝', category: 'dialogue', points: 20 },
    { id: 'elara_doubt', title: 'Healthy Skepticism', description: 'Question Elara\'s motives.', icon: '🤨', category: 'dialogue', points: 20 },
    { id: 'elara_backstory', title: 'Tragic Backstory', description: 'Learn about Elara\'s past.', icon: '💔', category: 'dialogue', points: 35 },
    { id: 'all_choices', title: 'Completionist', description: 'See all dialogue options in a single conversation.', icon: '📚', category: 'dialogue', points: 50 },
    { id: 'silent_type', title: 'The Silent Type', description: 'Complete a conversation without asking questions.', icon: '🤐', category: 'dialogue', points: 25 },

    // ── COMBAT ─────────────────────────────────────────────────────────────
    { id: 'first_kill', title: 'Necessary Evil', description: 'Defeat your first Echo.', icon: '💀', category: 'combat', points: 15 },
    { id: 'ten_kills', title: 'Echo Hunter', description: 'Defeat 10 Echoes.', icon: '⚔️', category: 'combat', points: 30 },
    { id: 'fifty_kills', title: 'Purifier', description: 'Defeat 50 Echoes.', icon: '🔥', category: 'combat', points: 75 },
    { id: 'headshot', title: 'Precision', description: 'Land a critical hit.', icon: '🎯', category: 'combat', points: 25 },
    { id: 'no_damage', title: 'Untouchable', description: 'Survive an encounter without taking damage.', icon: '🛡️', category: 'combat', points: 50 },
    { id: 'slide_kill', title: 'Stylish', description: 'Defeat an Echo while sliding.', icon: '🌊', category: 'combat', points: 40 },

    // ── EXPLORATION ────────────────────────────────────────────────────────
    { id: 'first_steps', title: 'First Steps', description: 'Move for the first time.', icon: '👣', category: 'exploration', points: 5 },
    { id: 'jump', title: 'Gravity is a Suggestion', description: 'Jump for the first time.', icon: '🦘', category: 'exploration', points: 5 },
    { id: 'sprint', title: 'In a Hurry', description: 'Sprint for the first time.', icon: '💨', category: 'exploration', points: 5 },
    { id: 'slide', title: 'Smooth Operator', description: 'Slide for the first time.', icon: '🏂', category: 'exploration', points: 10 },
    { id: 'cryo_pod', title: 'Cold Storage', description: 'Examine a cryo pod.', icon: '🧊', category: 'exploration', points: 15 },
    { id: 'dark_corner', title: 'Afraid of the Dark?', description: 'Venture into the darkest part of the outpost.', icon: '🌑', category: 'exploration', points: 20 },

    // ── SURVIVAL ───────────────────────────────────────────────────────────
    { id: 'survive_5min', title: 'Still Breathing', description: 'Survive for 5 minutes.', icon: '⏱️', category: 'survival', points: 20 },
    { id: 'survive_15min', title: 'Endurance', description: 'Survive for 15 minutes.', icon: '⌛', category: 'survival', points: 50 },
    { id: 'low_health', title: 'On the Edge', description: 'Survive with less than 10% health.', icon: '❤️', category: 'survival', points: 30 },

    // ── SECRET ─────────────────────────────────────────────────────────────
    { id: 'secret_room', title: 'There\'s Always a Secret Room', description: 'Find the hidden chamber.', icon: '🚪', category: 'secret', points: 75 },
    { id: 'kael_log', title: 'Kael\'s Last Words', description: 'Find Kael\'s final log entry.', icon: '📼', category: 'secret', points: 100 },
    { id: 'easter_egg', title: 'You Found It', description: 'Discover the developer\'s hidden message.', icon: '🥚', category: 'secret', points: 150 },
    { id: 'true_ending', title: 'The Real Signal', description: 'Uncover the truth behind Outpost 13.', icon: '🌌', category: 'secret', points: 200 },
];

export const ACHIEVEMENT_MAP = Object.fromEntries(ACHIEVEMENTS.map(a => [a.id, a]));

export const useAchievementStore = create<AchievementState>()(
    persist(
        (set, get) => ({
            unlocked: {},
            recentlyUnlocked: null,

            unlock: (id: string) => {
                const { unlocked } = get();
                if (unlocked[id]) return; // Already unlocked

                const achievement = ACHIEVEMENT_MAP[id];
                if (!achievement) return;

                set({
                    unlocked: { ...unlocked, [id]: Date.now() },
                    recentlyUnlocked: achievement,
                });

                // Play sound effect
                try {
                    const ctx = new AudioContext();
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.frequency.setValueAtTime(440, ctx.currentTime);
                    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1);
                    osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.2);
                    gain.gain.setValueAtTime(0.3, ctx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
                    osc.start(ctx.currentTime);
                    osc.stop(ctx.currentTime + 0.5);
                } catch (e) { /* Audio not available */ }
            },

            clearRecent: () => set({ recentlyUnlocked: null }),
            isUnlocked: (id: string) => !!get().unlocked[id],
        }),
        {
            name: 'echoes-achievements',
            partialize: (state) => ({ unlocked: state.unlocked }),
        }
    )
);
