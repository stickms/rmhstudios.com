export interface GameInfo {
    id: string;
    title: string;
    description: string;
    longDescription: string;
    href: string;
    status: string;
    cta: string;
    isSteam: boolean;

    // Homepage card styling
    gradient: string;
    iconName: string;

    // Games page styling
    color: string;
    tags: string[];
    imagePath?: string;
    authGate: boolean;
}

/**
 * Single source of truth for all games displayed on the site.
 * Both the homepage ProjectsSection and /games page read from this list.
 *
 * `iconName` is a Lucide icon name — each consumer maps it to the
 * actual React element with whatever size/style it needs.
 */
export const games: GameInfo[] = [
    {
        id: 'rmhbox',
        title: 'RMHbox',
        description: 'Party game madness! Join a lobby and play 16+ minigames with friends.',
        longDescription:
            'Create or join a lobby, vote on minigames, and compete with friends in real-time. Features 16+ unique minigames across word, trivia, action, and creative categories with live leaderboards and match history.',
        href: '/rmhbox',
        status: 'Playable',
        cta: 'Play Now',
        isSteam: false,
        gradient: 'from-purple-500 to-pink-500',
        iconName: 'Gamepad2',
        color: 'from-purple-500/20 to-pink-500/20 hover:border-purple-500/50',
        tags: ['Multiplayer', 'Party', 'Minigames'],
        imagePath: '/images/games/rmhbox.png',
        authGate: true,
    },
    {
        id: 'altair',
        title: 'Altair',
        description:
            'A narrative-driven extraction thriller set on a fragmented deep space mining rig.',
        longDescription:
            'Navigate Outpost 13, a reality-glitched mining station overrun by "Echoes." Use your neural link to piece together fragmented memories, manage cryo-sickness, and survive the shadows in this narrative-heavy survival experience.',
        href: '/altair',
        status: 'Playable',
        cta: 'Play Now',
        isSteam: false,
        gradient: 'from-(--neon-purple) to-(--neon-pink)',
        iconName: 'Brain',
        color: 'from-cyan-500/20 to-blue-600/20 hover:border-cyan-500/50',
        tags: ['Deckbuilder', 'Roguelike', 'Strategy'],
        imagePath: '/images/games/altair.png',
        authGate: true,
    },
    {
        id: 'slice-it',
        title: 'Slice It!',
        description: 'A high-octane neon rhythm game where you slice through beats in a pulse-pounding world.',
        longDescription:
            'Test your reflexes as you slice through beat sequences and dodge obstacles in a vibrant, neon-soaked environment. Feature-rich with global leaderboards, multiplayer lobbies, and support for custom track uploads.',
        href: '/slice-it',
        status: 'Playable Demo',
        cta: 'Play Now',
        isSteam: false,
        gradient: 'from-(--neon-cyan) to-(--neon-blue)',
        iconName: 'Music',
        color: 'from-rose-500/20 to-purple-600/20 hover:border-rose-500/50',
        tags: ['Arcade', 'Rhythm', 'Action'],
        imagePath: '/images/games/slice_it.png',
        authGate: true,
    },
    {
        id: 'synapse-storm',
        title: 'Synapse Storm',
        description: 'Juggle a storm of micro-challenges. Stay sharp.',
        longDescription: 'Juggle a storm of micro-challenges. Stay sharp. See how long your mind can keep up before the load becomes too great.',
        href: '/synapse-storm',
        status: 'Playable',
        cta: 'Enter the Storm',
        isSteam: false,
        gradient: 'from-cyan-500 to-pink-500',
        iconName: 'Zap',
        color: 'from-cyan-500/20 to-pink-500/20 hover:border-cyan-500/50',
        tags: ['Action', 'Puzzle', 'Fast-paced'],
        imagePath: '/images/games/synapsestorm.png',
        authGate: true,
    },
    {
        id: 'temple-of-joy',
        title: 'Temple of Joy',
        description: 'An advanced idle clicker exploring the pursuit of bliss through spiritual and carnal indulgence.',
        longDescription:
            'Accumulate Happiness to construct a sprawling temple of delights. Balance the Hedonic Treadmill, earn Karma through pilgrimages, and Transcend the Wheel of Samsara in a deep idle game featuring relics, rituals, and philosophical choices.',
        href: '/temple-of-joy',
        status: 'Playable',
        cta: 'Enter the Temple',
        isSteam: false,
        gradient: 'from-amber-700 to-yellow-600',
        iconName: 'Crown',
        color: 'from-amber-700/20 to-yellow-600/20 hover:border-amber-500/50',
        tags: ['Idle', 'Clicker', 'Prestige'],
        imagePath: '/images/games/temple_of_joy.png',
        authGate: true,
    },
    {
        id: 'neon-driftway',
        title: 'Neon Driftway',
        description: 'An endless highway survival racer featuring high-speed drifting and close-call mechanics.',
        longDescription:
            'Push your car to the limit across three distinct levels: Sunset Freeway, Rainline, and Night Circuit. Rack up multipliers with daring close calls, manage grip in the rain, and dodge aggressive traffic in a neon-soaked endless racer.',
        href: '/neon-driftway',
        status: 'Playable Demo',
        cta: 'Play Now',
        isSteam: false,
        gradient: 'from-red-600 to-cyan-600',
        iconName: 'Zap',
        color: 'from-red-500/20 to-cyan-600/20 hover:border-red-500/50',
        tags: ['Arcade', 'Racing', 'Endless'],
        imagePath: '/images/games/neon_driftway.png',
        authGate: true,
    },
    {
        id: 'laundry-sort',
        title: 'Laundry Sort',
        description: 'A frantic physics-based arcade game where gravity and color matching are your only tools.',
        longDescription:
            'Sort falling laundry into color-coded bins using ragdoll physics. Watch clothes tumble and bounce through complex dividers as you chase high scores in a race against the clock. Simple controls, chaotic physics.',
        href: '/laundry-sort',
        status: 'Playable Demo',
        cta: 'Play Now',
        isSteam: false,
        gradient: 'from-[#ff6b6b] to-[#ee5a6f]',
        iconName: 'Zap',
        color: 'from-yellow-500/20 to-orange-600/20 hover:border-yellow-500/50',
        tags: ['Casual', 'Physics', 'Puzzle'],
        imagePath: '/images/games/laundry_sort.png',
        authGate: true,
    },
];


