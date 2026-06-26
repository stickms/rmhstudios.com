export interface GameInfo {
    id: string;
    title: string;
    description: string;
    longDescription: string;
    href: string;
    status?: string;
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
    unlisted?: boolean;
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
        cta: 'Play Now',
        isSteam: false,
        gradient: 'from-purple-500 to-pink-500',
        iconName: 'Gamepad2',
        color: 'from-purple-500/20 to-pink-500/20 hover:border-purple-500/50',
        tags: ['Multiplayer', 'Party', 'Minigames'],
        imagePath: '/images/games/rmhbox.webp',
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
        cta: 'Play Now',
        isSteam: false,
        gradient: 'from-(--neon-purple) to-(--neon-pink)',
        iconName: 'Brain',
        color: 'from-cyan-500/20 to-blue-600/20 hover:border-cyan-500/50',
        tags: ['Deckbuilder', 'Roguelike', 'Strategy'],
        imagePath: '/images/games/altair.webp',
        authGate: true,
    },
    {
        id: 'daily-puzzles',
        title: 'Daily Puzzles',
        description: 'Six daily brain games: Lights Out, Alibi, Spectrum, Outcast, Chainlink, and Impostor. New puzzles every day at midnight EST.',
        longDescription:
            'A suite of six daily brain games. Toggle lights in Lights Out, solve crime scenarios in Alibi, rank items in Spectrum, spot the odd one out in Outcast, build word chains in Chainlink, and detect lies in Impostor. Share your results with friends and compete for the best scores.',
        href: '/daily',
        cta: 'Play Today\'s Puzzles',
        isSteam: false,
        gradient: 'from-violet-500 to-pink-500',
        iconName: 'Puzzle',
        color: 'from-violet-500/20 to-pink-500/20 hover:border-violet-500/50',
        tags: ['Puzzle', 'Daily', 'Brain Games'],
        imagePath: '/images/games/daily_puzzles.webp',
        authGate: false,
    },
    {
        id: 'versecraft',
        title: 'Versecraft',
        description: 'A visual novel that writes a brand-new emotional story every time — your cast, your bonds, your seed to share.',
        longDescription:
            'Every playthrough is generated from a seed: a unique anime cast, setting, and a multi-act, character-driven story you steer through choices and poem-writing. Prompt the kind of experience you want or roll the dice, deepen bonds with the cast, and share your seed so anyone can replay your exact version.',
        href: '/versecraft',
        cta: 'Play Now',
        isSteam: false,
        gradient: 'from-amber-700 to-purple-800',
        iconName: 'Feather',
        color: 'from-amber-700/20 to-purple-800/20 hover:border-amber-500/50',
        tags: ['Visual Novel', 'AI-Generated', 'Romance', 'Poetry'],
        imagePath: '/images/games/versecraft.webp',
        authGate: false,
    },
    {
        id: 'slice-it',
        title: 'Slice It!',
        description: 'A high-octane neon rhythm game where you slice through beats in a pulse-pounding world.',
        longDescription:
            'Test your reflexes as you slice through beat sequences and dodge obstacles in a vibrant, neon-soaked environment. Feature-rich with global leaderboards, multiplayer lobbies, and support for custom track uploads.',
        href: '/slice-it',
        cta: 'Play Now',
        isSteam: false,
        gradient: 'from-(--neon-cyan) to-(--neon-blue)',
        iconName: 'Music',
        color: 'from-rose-500/20 to-purple-600/20 hover:border-rose-500/50',
        tags: ['Arcade', 'Rhythm', 'Action'],
        imagePath: '/images/games/slice_it.webp',
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
        cta: 'Drive Now',
        isSteam: false,
        gradient: 'from-cyan-500 to-purple-600',
        iconName: 'Car',
        color: 'from-cyan-500/20 to-purple-600/20 hover:border-cyan-500/50',
        tags: ['Simulation', 'Driving', '3D', 'Cyberpunk'],
        imagePath: '/images/games/velum2099.webp',
        authGate: false,
    },
    {
        id: 'synapse-storm',
        title: 'Synapse Storm',
        description: 'Juggle a storm of micro-challenges. Stay sharp.',
        longDescription: 'Juggle a storm of micro-challenges. Stay sharp. See how long your mind can keep up before the load becomes too great.',
        href: '/synapse-storm',
        cta: 'Enter the Storm',
        isSteam: false,
        gradient: 'from-cyan-500 to-pink-500',
        iconName: 'Zap',
        color: 'from-cyan-500/20 to-pink-500/20 hover:border-cyan-500/50',
        tags: ['Action', 'Puzzle', 'Fast-paced'],
        imagePath: '/images/games/synapsestorm.webp',
        authGate: true,
    },
    {
        id: 'temple-of-joy',
        title: 'Temple of Joy',
        description: 'An advanced idle clicker exploring the pursuit of bliss through spiritual and carnal indulgence.',
        longDescription:
            'Accumulate Happiness to construct a sprawling temple of delights. Balance the Hedonic Treadmill, earn Karma through pilgrimages, and Transcend the Wheel of Samsara in a deep idle game featuring relics, rituals, and philosophical choices.',
        href: '/temple-of-joy',
        cta: 'Enter the Temple',
        isSteam: false,
        gradient: 'from-amber-700 to-yellow-600',
        iconName: 'Crown',
        color: 'from-amber-700/20 to-yellow-600/20 hover:border-amber-500/50',
        tags: ['Idle', 'Clicker', 'Prestige'],
        imagePath: '/images/games/temple_of_joy.webp',
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
        imagePath: '/images/games/neon_driftway.webp',
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
        imagePath: '/images/games/laundry_sort.webp',
        authGate: true,
    },
    {
        id: 'forest-explorer',
        title: 'Forest Explorer',
        description: 'Wander a peaceful 3D ancient forest, or play the 3-act narrative story mode with puzzles and lore.',
        longDescription:
            'A first-person 3D forest experience with two modes. Free Explore lets you roam through a dense ancient forest with towering conifers, glowing fireflies, and dappled sunlight. Story Mode is a 3-act narrative adventure featuring logic puzzles, environmental storytelling, and a discoverable journal system.',
        href: '/forest-explorer',
        cta: 'Explore',
        isSteam: false,
        gradient: 'from-green-700 to-emerald-900',
        iconName: 'TreePine',
        color: 'from-green-700/20 to-emerald-900/20 hover:border-green-500/50',
        tags: ['Exploration', '3D', 'Relaxing'],
        imagePath: '/images/games/forest_explorer.webp',
        authGate: false,
    },
    {
        id: 'void-breaker',
        title: 'Void Breaker',
        description: 'Obsidian and gold arena shooter. Collect void shards, dash, slow time with Focus, detonate when overwhelmed.',
        longDescription:
            'Survive waves of enemies in a dark arena. Collect void shards that orbit you as a shield and score multiplier. Activate Focus for bullet-time. Dash to dodge. Detonate your shard ring for a devastating Void Burst. Boss fights every 5 waves.',
        href: '/void-breaker',
        cta: 'Play',
        isSteam: false,
        gradient: 'from-orange-500 to-pink-600',
        iconName: 'Crosshair',
        color: 'from-orange-500/20 to-pink-600/20 hover:border-orange-500/50',
        tags: ['Arcade', 'Shooter', '3D', 'Survival'],
        imagePath: '/images/games/voidbreaker.webp',
        authGate: true,
    },
    {
        id: 'kowloon-knockout',
        title: 'Kowloon Knockout',
        description: 'A 2D retro pixel-art boxing game set in 90s Hong Kong with combos, counter-strikes, and multiplayer.',
        longDescription:
            'Step into the neon-lit streets of Kowloon, 1997. Choose from three fighter classes — Power, Speed, or Resistance — master devastating combos, and battle AI opponents or challenge a friend in real-time versus mode over WebSocket.',
        href: '/kowloon-knockout',
        cta: 'Fight Now',
        isSteam: false,
        gradient: 'from-pink-500 to-purple-600',
        iconName: 'Swords',
        color: 'from-pink-500/20 to-purple-600/20 hover:border-pink-500/50',
        tags: ['Fighting', 'Multiplayer', 'Retro'],
        imagePath: '/images/games/Kowloon-Knockout.webp',
        authGate: false,
    },
    {
        id: 'rmh-coding-simulator',
        title: 'RMH Coding Simulator',
        description: 'A deep idle clicker where you write Lines of Code, hire AI developers, ship products, and IPO your studio. Features an AI Architect powered by DeepSeek.',
        longDescription:
            'Simulate life as an RMH developer in this two-layer-prestige incremental game. Write Lines of Code by hand, hire 14 tiers of auto-coders from Interns to The Codeverse, snag floating Golden Commits for frenzy buffs, and unlock 130+ upgrades. Ship products for Reputation, spend it on a permanent skill tree, then IPO your studio for Equity in a deep endgame with 200+ hours of progression. Chat with ARCH-1, your in-character AI Architect powered by DeepSeek, and generate live sprint buffs.',
        href: '/rmh-coding-simulator',
        cta: 'Start Coding',
        isSteam: false,
        gradient: 'from-emerald-500 to-cyan-500',
        iconName: 'Code2',
        color: 'from-emerald-500/20 to-cyan-500/20 hover:border-emerald-500/50',
        tags: ['Idle', 'Clicker', 'Prestige', 'AI'],
        imagePath: '/images/games/rmh_coding_simulator.svg',
        authGate: false,
    },
];


