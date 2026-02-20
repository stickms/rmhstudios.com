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
        description: 'A roguelike deckbuilder where you match waveform sequences to survive.',
        longDescription:
            'Build your deck of waveforms and match sequences to defeat enemies. Every run is different as you navigate floors of increasing difficulty. Manage your tempo, control static corruption, and discover powerful synergies. A game about composing the perfect signal.',
        href: '/signal-forge',
        status: 'Playable Demo',
        cta: 'Play Now',
        isSteam: false,
        gradient: 'from-cyan-600 to-blue-600',
        iconName: 'Zap',
        color: 'from-cyan-500/20 to-blue-600/20 hover:border-cyan-500/50',
        tags: ['Deckbuilder', 'Roguelike', 'Strategy'],
    },
    {
        id: 'temple-of-joy',
        title: 'Temple of Joy',
        description: 'An idle clicker about the pursuit of happiness. Build your temple, earn bliss, transcend.',
        longDescription:
            'Accumulate Happiness through clicking and constructing an ever-expanding temple of earthly delights. Manage the Hedonic Treadmill, earn Karma through spiritual practices, and Transcend reality itself via the Wheel of Samsara. An idle game about what it means to feel good.',
        href: '/temple-of-joy',
        status: 'Playable',
        cta: 'Enter the Temple',
        isSteam: false,
        gradient: 'from-amber-700 to-yellow-600',
        iconName: 'Crown',
        color: 'from-amber-700/20 to-yellow-600/20 hover:border-amber-500/50',
        tags: ['Idle', 'Clicker', 'Prestige'],
    },
    {
        id: 'cursed-logic',
        title: 'Cursed Logic',
        description:
            'A turn-based duel against an unstable Protocol. Commit actions in secret, resolve simultaneously.',
        longDescription:
            'Interface with a hostile, semi-sentient system that controls a shared reality. Each round you and the Protocol commit to one action in secret; resolution is simultaneous. The system is unstable—rules and modifiers shift between rounds. Outsmart chaos under severe resource constraint. Absurd, dark, and slightly comedic.',
        href: '/cursed-logic',
        status: 'Playable Demo',
        cta: 'Duel the Protocol',
        isSteam: false,
        gradient: 'from-cyan-900 to-amber-900',
        iconName: 'Swords',
        color: 'from-amber-500/20 to-orange-600/20 hover:border-amber-500/50',
        tags: ['Turn-based', 'Duel', 'Minigames'],
    },
    {
        id: 'echoes',
        title: 'Echoes of the Spire',
        description:
            'A narrative-driven puzzle game exploring memory, identity, and the nature of reality.',
        longDescription:
            'Dive into a fragmented reality where memories are currency. Solve complex narrative puzzles to piece together the truth of your existence before the entropy of the void dissolves everything you know. Features non-linear storytelling, adaptive audio landscapes, and choices that ripple across timelines.',
        href: '/echoes',
        status: 'Playable',
        cta: 'Play Now',
        isSteam: false,
        gradient: 'from-[var(--neon-purple)] to-[var(--neon-pink)]',
        iconName: 'Brain',
        color: 'from-cyan-500/20 to-blue-600/20 hover:border-cyan-500/50',
        tags: ['Deckbuilder', 'Roguelike', 'Strategy'],
    },
    {
        id: 'slice-it',
        title: 'Slice It!',
        description: 'A high-octane rhythm game where you slice beats to the music.',
        longDescription:
            'Test your reflexes in this neon-soaked rhythm game. Slice through beats, dodge obstacles, and aim for the high score in a world that pulses to the music. Upload your own tracks or play the demo.',
        href: '/slice-it',
        status: 'Playable Demo',
        cta: 'Play Now',
        isSteam: false,
        gradient: 'from-[var(--neon-cyan)] to-[var(--neon-blue)]',
        iconName: 'Music',
        color: 'from-rose-500/20 to-purple-600/20 hover:border-rose-500/50',
        tags: ['Arcade', 'Rhythm', 'Action'],
    },
    {
        id: 'laundry-sort',
        title: 'Laundry Sort',
        description: 'A physics-based game where gravity and color matching are everything.',
        longDescription:
            'Sort falling laundry into color-matched bins using gravity and ragdoll physics. Watch as clothes tumble and bounce through the air. Earn points for correct sorts, but watch out—put a red shirt in the blue bin and you\'ll lose points! Features dynamic physics, vibrant colors, and addictive gameplay.',
        href: '/laundry-sort',
        status: 'Playable Demo',
        cta: 'Play Now',
        isSteam: false,
        gradient: 'from-[#ff6b6b] to-[#ee5a6f]',
        iconName: 'Zap',
        color: 'from-yellow-500/20 to-orange-600/20 hover:border-yellow-500/50',
        tags: ['Casual', 'Physics', 'Puzzle'],
    },
    {
        id: 'vega',
        title: 'Project Vega',
        description: 'A Chrono-Loop Tower Defense where you defend against intrusive thoughts.',
        longDescription:
            'Defend the Memory Core across 3 recursive timelines. Your towers from previous loops become \'Ghost Protocols\' that assist you. Merging timelines creates Paradoxes. A clinical horror aesthetic inspired by Balatro and Pony Island.',
        href: '/vega',
        status: 'Prototype',
        cta: 'Initialize Loop',
        isSteam: false,
        gradient: 'from-green-900 to-green-600',
        iconName: 'BrainCircuit',
        color: 'from-green-500/20 to-emerald-600/20 hover:border-green-500/50',
        tags: ['Tower Defense', 'Strategy', 'Experimental'],
    },
    {
        id: 'house-always-wins',
        title: 'House Always Wins',
        description: 'A casino metroidvania where gambling is corruption.',
        longDescription:
            'A dark, narrative 2D exploration-platformer inside an old, abandoned casino. Inspired by Hollow Knight, Celeste, and Undertale. Gambling never blocks progress—it only changes difficulty, debt, NPC tone, and the world around you. The house always wins, but how you play changes everything.',
        href: '/house-always-wins',
        status: 'In Development',
        cta: 'Enter Casino',
        isSteam: false,
        gradient: 'from-amber-950 to-neutral-900',
        iconName: 'Crown',
        color: 'from-amber-950/40 to-neutral-900/20 hover:border-amber-500/50',
        tags: ['Metroidvania', 'Narrative', 'In Development'],
    },
    {
        id: 'satans-library',
        title: "Satan's Library",
        description:
            "A survival horror where you 'lock in' to gain Knowledge and Aura while escaping succubi.",
        longDescription:
            "A survival horror where you play as an underdog in a library overrun by succubi and chadlites. Your goal: 'lock in' and build your Knowledge and Aura stats to escape. Resist temptation, survive beatdowns, and outsmart Satan (Rish) himself in this high-stakes test of willpower.",
        href: '#',
        status: 'In Development',
        cta: 'Wishlist on Steam',
        isSteam: true,
        gradient: 'from-red-900 to-red-600',
        iconName: 'BookOpen',
        color: 'from-red-900/40 to-red-600/20 hover:border-red-500/50',
        tags: ['Survival Horror', 'Steam', 'In Development'],
    },
    {
        id: 'rmhdle',
        title: 'RMHdle',
        description: 'The daily word game for the RMH community.',
        longDescription:
            'A daily word challenge where you guess a 5-letter word in 6 tries. Part of the RMH Discord integration, featuring community-specific words and global competition.',
        href: 'https://discord.gg/ZdfhdAKVSf',
        status: 'Discord Game',
        cta: 'Play on Discord',
        isSteam: false,
        gradient: 'from-[#5865F2] to-[#404EED]',
        iconName: 'Brain',
        color: 'from-indigo-500/20 to-blue-600/20 hover:border-indigo-500/50',
        tags: ['Discord', 'Word Game', 'Daily'],
    },
    {
        id: 'rmh-connections',
        title: 'RMHConnections',
        description: 'Find the common threads between RMH community terms.',
        longDescription:
            'Group sixteen items into four categories of four. Each daily puzzle features references, history, and characters from the RMH community. Stay local or compete globally.',
        href: 'https://discord.gg/ZdfhdAKVSf',
        status: 'Discord Game',
        cta: 'Play on Discord',
        isSteam: false,
        gradient: 'from-[#7289da] to-[#5865F2]',
        iconName: 'Rocket',
        color: 'from-violet-500/20 to-purple-600/20 hover:border-violet-500/50',
        tags: ['Discord', 'Puzzle', 'Daily'],
    },
];
