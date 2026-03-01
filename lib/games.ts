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
        id: 'daily-puzzle',
        title: 'Lights Out',
        description: 'A new logic puzzle every day. Turn off all the lights—one tap at a time.',
        longDescription:
            'Classic Lights Out: tap a cell to toggle it and its neighbors. Solve in as few moves as possible. A fresh puzzle appears each day. No account needed.',
        href: '/daily-puzzle',
        status: 'Playable',
        cta: 'Play',
        isSteam: false,
        gradient: 'from-amber-500 to-orange-600',
        iconName: 'Sparkles',
        color: 'from-amber-500/20 to-orange-600/20 hover:border-amber-500/50',
        tags: ['Puzzle', 'Daily', 'Logic'],
        imagePath: '/images/games/lights_out.png',
        authGate: false,
    },
    {
        id: 'versecraft',
        title: 'Versecraft',
        description: 'A poetry puzzle visual novel. Compose poems, romance characters, and unravel literary mysteries.',
        longDescription:
            'Join the Ivory Quill Society and discover the power of words. Select words to compose poems, arrange lines for maximum impact, and watch as six unique characters react to your literary creations. A DDLC-inspired visual novel where every word matters.',
        href: '/versecraft',
        status: 'Playable',
        cta: 'Play Now',
        isSteam: false,
        gradient: 'from-amber-700 to-purple-800',
        iconName: 'Feather',
        color: 'from-amber-700/20 to-purple-800/20 hover:border-amber-500/50',
        tags: ['Visual Novel', 'Puzzle', 'Poetry'],
        imagePath: '/images/games/versecraft.png',
        authGate: false,
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
        id: 'velum2099',
        title: 'VELUM2099',
        description:
            'A cyberpunk driving simulator featuring procedural city generation, drift physics, and VHS aesthetics.',
        longDescription:
            'Navigate neon-lit streets of a procedurally generated cyberpunk city. Features realistic drift physics, rain effects, procedural lo-fi/jazz radio, engine sound synthesis, and a full VHS post-processing pipeline with semantic segmentation.',
        href: '/velum2099',
        status: 'Playable',
        cta: 'Drive Now',
        isSteam: false,
        gradient: 'from-cyan-500 to-purple-600',
        iconName: 'Car',
        color: 'from-cyan-500/20 to-purple-600/20 hover:border-cyan-500/50',
        tags: ['Simulation', 'Driving', '3D', 'Cyberpunk'],
        imagePath: '/images/games/velum2099.png',
        authGate: false,
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
    {
        id: 'forest-explorer',
        title: 'Forest Explorer',
        description: 'Wander a peaceful 3D ancient forest. Towering pines, glowing fireflies, golden light.',
        longDescription:
            'A tranquil first-person 3D experience. Roam freely through a dense ancient forest filled with towering conifers, glowing fireflies, low-lying mist, and dappled golden-hour sunlight. No objectives—just explore and breathe.',
        href: '/forest-explorer',
        status: 'Playable',
        cta: 'Explore',
        isSteam: false,
        gradient: 'from-green-700 to-emerald-900',
        iconName: 'TreePine',
        color: 'from-green-700/20 to-emerald-900/20 hover:border-green-500/50',
        tags: ['Exploration', '3D', 'Relaxing'],
        imagePath: '/images/games/forest_explorer.jpg',
        authGate: false,
    },
    {
        id: 'void-breaker',
        title: 'Void Breaker',
        description: 'Obsidian and gold arena shooter. Collect void shards, dash, slow time with Focus, detonate when overwhelmed.',
        longDescription:
            'Survive waves of enemies in a dark arena. Collect void shards that orbit you as a shield and score multiplier. Activate Focus for bullet-time. Dash to dodge. Detonate your shard ring for a devastating Void Burst. Boss fights every 5 waves.',
        href: '/void-breaker',
        status: 'Playable',
        cta: 'Play',
        isSteam: false,
        gradient: 'from-orange-500 to-pink-600',
        iconName: 'Crosshair',
        color: 'from-orange-500/20 to-pink-600/20 hover:border-orange-500/50',
        tags: ['Arcade', 'Shooter', '3D', 'Survival'],
        imagePath: '/images/games/voidbreaker.png',
        authGate: true,
    },
    {
        id: 'kowloon-knockout',
        title: 'Kowloon Knockout',
        description: 'A 2D retro pixel-art boxing game set in 90s Hong Kong with combos, counter-strikes, and multiplayer.',
        longDescription:
            'Step into the neon-lit streets of Kowloon, 1997. Choose from three fighter classes — Power, Speed, or Resistance — master devastating combos, and battle AI opponents or challenge a friend in real-time versus mode over WebSocket.',
        href: '/kowloon-knockout',
        status: 'Playable',
        cta: 'Fight Now',
        isSteam: false,
        gradient: 'from-pink-500 to-purple-600',
        iconName: 'Swords',
        color: 'from-pink-500/20 to-purple-600/20 hover:border-pink-500/50',
        tags: ['Fighting', 'Multiplayer', 'Retro'],
        imagePath: '/images/games/Kowloon-Knockout.png',
        authGate: false,
    },
];


