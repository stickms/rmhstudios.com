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
            'A cyberpunk courier driver: run timed deliveries and outrun the police across a procedural neon city.',
        longDescription:
            'Run courier deliveries through the neon-lit streets of a procedurally generated cyberpunk city — pick up cargo, race it to the drop-off before the timer runs out, and bank credits with a combo multiplier. Cause chaos and the police give chase: shake them off to escape, or get boxed in and busted. Features drift physics, an on-screen joystick for mobile play, rain effects, procedural lo-fi/jazz radio, engine sound synthesis, and a full VHS post-processing pipeline.',
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
        description: 'Wander a peaceful 3D ancient forest, plant a garden that grows in real time, or play the 3-act story mode with puzzles and lore.',
        longDescription:
            'A first-person 3D forest experience with two modes. Free Explore lets you roam a dense ancient forest with towering conifers, glowing fireflies, butterflies, and dappled sunlight — and plant your own garden of five flower species that grow in real time, even while you\'re away. Story Mode is a 3-act narrative adventure following the trail of the forest\'s last Warden, featuring nine logic puzzles, environmental storytelling, letterboxed narration, and a discoverable journal system.',
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
        description: 'A neon 3D brawler set in 90s Hong Kong — pixel-shaded stick fighters, combos, and up to 4-player FFA or team battles.',
        longDescription:
            'Step into the neon-lit rooftops of Kowloon, 1997, rendered in fully animated 3D stick fighters with a retro pixel-art filter. Pick from nine fighter classes, master devastating combos and counter-strikes, and brawl across an open arena. Battle the CPU solo or take up to four players online in free-for-all or 2v2 teams — with touch controls on mobile.',
        href: '/kowloon-knockout',
        cta: 'Fight Now',
        isSteam: false,
        gradient: 'from-pink-500 to-purple-600',
        iconName: 'Swords',
        color: 'from-pink-500/20 to-purple-600/20 hover:border-pink-500/50',
        tags: ['Fighting', 'Multiplayer', '3D'],
        imagePath: '/images/games/Kowloon-Knockout.webp',
        authGate: false,
    },
    {
        id: 'cookgame',
        title: 'CookGame',
        description: 'A satirical underground tycoon sim — buy ingredients, mix product for wild effects, and hustle your block before the heat catches up.',
        longDescription:
            'A tongue-in-cheek crime-management sim. Run a small-town operation: stock up at the supplier, experiment at the mixing bench to stack value-boosting effects onto your product, package it, and sell to the neighbourhood — all while keeping your heat meter cool. Pure fiction, all invented strains and effects.',
        href: '/cookgame',
        cta: 'Play Now',
        isSteam: false,
        gradient: 'from-lime-500 to-emerald-700',
        iconName: 'FlaskConical',
        color: 'from-lime-500/20 to-emerald-700/20 hover:border-lime-500/50',
        tags: ['Simulation', 'Tycoon', 'Crime'],
        imagePath: '/images/games/cookgame.webp',
        authGate: false,
    },
    {
        id: 'rochester-offensive',
        title: 'Mental-Hospital: Rochester Offensive',
        description: 'A pixelated tactical 5v5 FPS — agents, abilities, an economy, the spike and MR13, plus co-op Zombies and online lobbies.',
        longDescription:
            'A browser-based, Valorant-inspired tactical shooter rendered in chunky pixel-art 3D. Pick an agent, buy weapons and abilities each round, plant or defuse the spike, and play to 13 in standard 5v5 — or team up for wave-based co-op Zombies against walkers, runners, brutes and spitters. Online lobbies with public/private rooms, team selection, and host-configurable AI fill, plus full mobile support with an on-screen joystick.',
        href: '/rochester-offensive',
        cta: 'Play Now',
        isSteam: false,
        gradient: 'from-red-600 to-blue-600',
        iconName: 'Crosshair',
        color: 'from-red-500/20 to-blue-600/20 hover:border-red-500/50',
        tags: ['FPS', 'Multiplayer', 'Tactical', '3D'],
        imagePath: '/images/games/rochester-offensive.webp',
        authGate: false,
    },
    {
        id: 'house-always-wins',
        title: 'House Always Wins',
        description: 'A dark casino metroidvania: explore the abandoned Mirage Royale, talk your way past its ghosts, unlock new moves, and outwit The House.',
        longDescription:
            'A narrative pixel-art metroidvania set inside a decaying casino. Explore six interconnected wings — Lobby, Poker Hall, Slot Vault, Security Wing, Maintenance shafts and the Vault — gating your progress behind three unlockable abilities: the Lucky Coin (double jump), the All-In Dash, and the Card Grip (wall climb). Talk to the Dealer, the old janitor Marlow, the slot-witch Vesper and Security Chief Doss, solve lever and pressure-plate puzzles, dodge spikes, lasers and camera cones, collect chips to pay down your ever-mounting Debt, recover three Vault Keys, and face The House in a multi-ending finale. Tight Celeste-style platforming, the deeper you owe the more the world distorts.',
        href: '/house-always-wins',
        cta: 'Enter the Casino',
        isSteam: false,
        gradient: 'from-amber-700 to-neutral-900',
        iconName: 'Crown',
        color: 'from-amber-700/20 to-neutral-900/40 hover:border-amber-500/50',
        tags: ['Metroidvania', 'Platformer', 'Narrative', 'Pixel Art'],
        imagePath: '/images/games/house_always_wins.webp',
        authGate: true,
    },
    {
        id: 'dream-rift',
        title: 'Dream Rift',
        description: 'A danmaku bullet hell — dodge gorgeous bullet curtains solo or in up to 4-player co-op across three dream worlds.',
        longDescription:
            'A vertical bullet-hell shoot-’em-up: weave a tiny pinpoint hitbox through dense, beautiful danmaku curtains, graze bullets for score, bomb to survive, and capture each boss’s spell cards before the timer runs out. Four playable dreamers — the shrine maiden Reika, the star-thief witch Mira, the tideglass diviner Aoi and void-walker Nyx — each with a distinct shot type. Three stages with mid-bosses, animated bosses and a synced story, a driving techno soundtrack, and Nico Nico–style scrolling comments. Play solo, or create public/private lobbies for up to four-player co-op with forgiving client-authoritative netcode (lag never kills you). Fixed-aspect, fair-by-design, with full mobile touch controls.',
        href: '/dream-rift',
        cta: 'Enter the Rift',
        isSteam: false,
        gradient: 'from-fuchsia-600 to-violet-700',
        iconName: 'Sparkles',
        color: 'from-fuchsia-500/20 to-violet-700/20 hover:border-fuchsia-500/50',
        tags: ['Bullet Hell', 'Multiplayer', 'Danmaku', 'Pixel Art'],
        imagePath: '/images/games/dream-rift.webp',
        authGate: false,
    },
    {
        id: 'rmh-farming-sim',
        title: 'RMH Farming Simulator',
        description: 'A cozy pixel-3D farming sim — till, plant, water and harvest, sell at the shop, upgrade your gear, and farm co-op with friends.',
        longDescription:
            'Claim your own pixelated 3D homestead and grow it from a few seed packets into a thriving farm. Till the soil, plant seasonal crops across spring, summer, fall and winter, water them (or let the rain do it), and harvest for Normal, Silver or Gold quality. Sell produce at the General Store and shipping bin, buy new seeds, and upgrade your Hoe, Watering Can and Scythe through Copper, Iron and Gold tiers for wider area-of-effect. Every farm has a shareable invite code: friends request to join, the host approves or declines, and you all share one wallet, inventory and plot of land in real-time co-op — with a previously-joined-farms list to hop back in and host kick controls to keep things friendly.',
        href: '/rmh-farming-sim',
        cta: 'Start Farming',
        isSteam: false,
        gradient: 'from-green-500 to-amber-600',
        iconName: 'Sprout',
        color: 'from-green-500/20 to-amber-600/20 hover:border-green-500/50',
        tags: ['Simulation', 'Farming', 'Co-op', 'Multiplayer', '3D'],
        imagePath: '/images/games/rmh-farming-sim.webp',
        authGate: true,
    },
];


