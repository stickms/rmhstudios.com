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
        id: 'signal-forge',
        title: 'Signal Forge',
        description: 'A rhythmic roguelike deckbuilder where you manipulate waveforms to stabilize the signal.',
        longDescription:
            'Build a deck of frequency modulations and pattern-match waveform sequences to survive. Manage static corruption, build tempo for massive bursts, and stabilize glitches in a clinical, tech-driven roguelike experience.',
        href: '/signal-forge',
        status: 'Playable Demo',
        cta: 'Play Now',
        isSteam: false,
        gradient: 'from-cyan-600 to-blue-600',
        iconName: 'Zap',
        color: 'from-cyan-500/20 to-blue-600/20 hover:border-cyan-500/50',
        tags: ['Deckbuilder', 'Roguelike', 'Strategy'],
        imagePath: '/images/games/signal_forge.png',
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
    },
    {
        id: 'cursed-logic',
        title: 'Cursed Logic',
        description:
            'A psychological turn-based duel against an unstable, semi-sentient AI Protocol.',
        longDescription:
            "Strategy meets absurdity in a high-stakes duel where actions resolve simultaneously. Choose your Stance, predict the Protocol's shifting Mutations, and manage your Integrity and Charge under the pressure of an unstable system.",
        href: '/cursed-logic',
        status: 'Playable Demo',
        cta: 'Duel the Protocol',
        isSteam: false,
        gradient: 'from-cyan-900 to-amber-900',
        iconName: 'Swords',
        color: 'from-amber-500/20 to-orange-600/20 hover:border-amber-500/50',
        tags: ['Turn-based', 'Duel', 'Minigames'],
        imagePath: '/images/games/cursed_logic.png',
    },
    {
        id: 'echoes',
        title: 'Echoes of the Spire',
        description:
            'A narrative-driven extraction thriller set on a fragmented deep space mining rig.',
        longDescription:
            'Navigate Outpost 13, a reality-glitched mining station overrun by "Echoes." Use your neural link to piece together fragmented memories, manage cryo-sickness, and survive the shadows in this narrative-heavy survival experience.',
        href: '/echoes',
        status: 'Playable',
        cta: 'Play Now',
        isSteam: false,
        gradient: 'from-[var(--neon-purple)] to-[var(--neon-pink)]',
        iconName: 'Brain',
        color: 'from-cyan-500/20 to-blue-600/20 hover:border-cyan-500/50',
        tags: ['Deckbuilder', 'Roguelike', 'Strategy'],
        imagePath: '/images/games/echoes_of_the_spire.png',
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
        gradient: 'from-[var(--neon-cyan)] to-[var(--neon-blue)]',
        iconName: 'Music',
        color: 'from-rose-500/20 to-purple-600/20 hover:border-rose-500/50',
        tags: ['Arcade', 'Rhythm', 'Action'],
        imagePath: '/images/games/slice_it.png',
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
    },
    {
        id: 'vega',
        title: 'Project Vega',
        description: 'A clinical horror tower defense featuring recursive timelines and Ghost Protocols.',
        longDescription:
            'Defend the Memory Core from intrusive thoughts across three recursive loops. Deploy Ghost Protocols from your past runs, merge timelines to create powerful Paradoxes, and survive the escalating difficulty of a clinical horror simulation.',
        href: '/vega',
        status: 'Prototype',
        cta: 'Initialize Loop',
        isSteam: false,
        gradient: 'from-green-900 to-green-600',
        iconName: 'BrainCircuit',
        color: 'from-green-500/20 to-emerald-600/20 hover:border-green-500/50',
        tags: ['Tower Defense', 'Strategy', 'Experimental'],
        imagePath: '/images/games/project_vega.png',
    },
    {
        id: 'house-always-wins',
        title: 'House Always Wins',
        description: 'A dark casino Metroidvania where gambling is a form of world-altering corruption.',
        longDescription:
            'Explore the depths of an abandoned, decaying casino in this 2D platformer. Debt is your greatest enemy, altering NPC interactions, world hazards, and difficulty as you uncover the secrets of a house that never loses.',
        href: '/house-always-wins',
        status: 'In Development',
        cta: 'Enter Casino',
        isSteam: false,
        gradient: 'from-amber-950 to-neutral-900',
        iconName: 'Crown',
        color: 'from-amber-950/40 to-neutral-900/20 hover:border-amber-500/50',
        tags: ['Metroidvania', 'Narrative', 'In Development'],
        imagePath: '/images/games/house_always_wins.png',
    },
    {
        id: 'satans-library',
        title: "Satan's Library",
        description:
            'A survival horror experience about "locking in" to survive the ultimate test of willpower.',
        longDescription:
            "Play as an underdog in a library overrun by succubi and chadlites. Resist temptation, build your Knowledge and Aura stats, and outsmart Satan himself in this high-stakes survival horror challenge.",
        href: '#',
        status: 'In Development',
        cta: 'Wishlist on Steam',
        isSteam: true,
        gradient: 'from-red-900 to-red-600',
        iconName: 'BookOpen',
        color: 'from-red-900/40 to-red-600/20 hover:border-red-500/50',
        tags: ['Survival Horror', 'Steam', 'In Development'],
        imagePath: '/images/games/satans_library.png',
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
    },
    {
        id: 'rmhdle',
        title: 'RMHdle',
        description: 'The official daily word challenge for the RMH community.',
        longDescription:
            'A daily 5-letter word game tailored for the RMH ecosystem. Join the community on Discord to share your streaks, compete with others, and guess secret terms from RMH history.',
        href: 'https://discord.gg/ZdfhdAKVSf',
        status: 'Discord Game',
        cta: 'Play on Discord',
        isSteam: false,
        gradient: 'from-[#5865F2] to-[#404EED]',
        iconName: 'Brain',
        color: 'from-indigo-500/20 to-blue-600/20 hover:border-indigo-500/50',
        tags: ['Discord', 'Word Game', 'Daily'],
        imagePath: '/images/games/rmhdle.png',
    },
    {
        id: 'rmh-connections',
        title: 'RMHConnections',
        description: 'A daily puzzle game about finding common threads in RMH lore.',
        longDescription:
            'Group sixteen community-themed items into four categories. A daily test of your RMH knowledge, featuring characters, memes, and historical events from across the community.',
        href: 'https://discord.gg/ZdfhdAKVSf',
        status: 'Discord Game',
        cta: 'Play on Discord',
        isSteam: false,
        gradient: 'from-[#7289da] to-[#5865F2]',
        iconName: 'Rocket',
        color: 'from-violet-500/20 to-purple-600/20 hover:border-violet-500/50',
        tags: ['Discord', 'Puzzle', 'Daily'],
        imagePath: '/images/games/rmhconnections.png',
    },
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
    },

];
