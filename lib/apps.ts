export interface AppInfo {
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

    // Apps page styling
    color: string;
    tags: string[];
    imagePath?: string;
    authGate: boolean;
    hidden?: boolean;
}

/**
 * Single source of truth for all apps displayed on the site.
 */
export const apps: AppInfo[] = [
    {
        id: 'rmhtube',
        title: 'RMHTube',
        description: 'Watch videos together in sync. Create rooms, queue media, and chat in real-time.',
        longDescription:
            'RMHTube is a real-time watch party platform. Create a room, share the code, and watch YouTube, Twitch, or direct videos in perfect sync with friends. Queue up media, vote to skip, react live, and chat — all powered by WebSocket magic.',
        href: '/rmhtube',
        status: 'Beta',
        cta: 'Watch Together',
        isSteam: false,
        gradient: 'from-red-500 via-pink-500 to-purple-600',
        iconName: 'MonitorPlay',
        color: 'from-red-500/20 to-purple-600/20 hover:border-red-500/50',
        tags: ['Watch Party', 'Real-time', 'Beta'],
        imagePath: '/images/games/rmhtube.png',
        authGate: true,
    },
    {
        id: 'rmh-code',
        title: 'RMH Code',
        description: 'A browser-based code editor. Write and save code right in your browser.',
        longDescription:
            'RMH Code brings the VS Code experience to your browser. Create projects, manage files in a tree, and write code with full syntax highlighting and IntelliSense — all saved to your account.',
        href: '/rmh-code',
        status: 'Beta',
        cta: 'Open Editor',
        isSteam: false,
        gradient: 'from-blue-600 via-indigo-500 to-violet-600',
        iconName: 'Code2',
        color: 'from-blue-500/20 to-violet-600/20 hover:border-blue-500/50',
        tags: ['Code Editor', 'Developer Tool', 'Beta'],
        imagePath: '/images/games/rmhcode.png',
        authGate: true,
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
        authGate: false,
        hidden: true,
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
        authGate: false,
        hidden: true,
    },
    {
        id: 'rmh-notes',
        title: 'RMHNotes',
        description: 'A cozy, feature-rich notes and reminders app. Capture ideas, organize with folders and tags, and never forget a thing.',
        longDescription:
            'RMHNotes is your personal cozy notebook. Write in a beautiful rich text editor, organize with folders and tags, set reminders, lock private notes, share read-only links, and track your mood — all in one warm, inviting app.',
        href: '/rmh-notes',
        status: 'Beta',
        cta: 'Open Notes',
        isSteam: false,
        gradient: 'from-amber-500 via-orange-400 to-yellow-400',
        iconName: 'NotebookPen',
        color: 'from-amber-500/20 to-orange-400/20 hover:border-amber-500/50',
        tags: ['Notes', 'Productivity', 'Reminders', 'Beta'],
        imagePath: '/images/games/rmhnotes.png',
        authGate: true,
    },
    {
        id: 'rmh-eats',
        title: 'RMH Eats',
        description: 'A food delivery app with restaurants, menus, cart, checkout, and order tracking.',
        longDescription:
            'RMH Eats is a fully-featured food delivery experience. Browse restaurants across different cuisines, customize menu items, manage your cart, go through a complete checkout flow, track orders in real-time, manage saved addresses and payment methods, and leave reviews.',
        href: '/rmh-eats',
        status: 'Beta',
        cta: 'Order Food',
        isSteam: false,
        gradient: 'from-orange-500 via-red-500 to-rose-600',
        iconName: 'Utensils',
        color: 'from-orange-500/20 to-red-500/20 hover:border-orange-500/50',
        tags: ['Food', 'Delivery', 'Beta'],
        imagePath: '/images/games/rmh-eats.png',
        authGate: false,
    },
    {
        id: 'rmh-jobs',
        title: 'RMH Job Search',
        description: 'Browse hundreds of job listings. Some real. Some ridiculous. All rejections guaranteed.',
        longDescription:
            'RMH Job Search is the premier job board for aspiring professionals and fantasy adventurers alike. Browse realistic tech roles alongside absurd postings like "Dragon Hunter" and "Professional Rubber Duck." Apply, get ghosted, receive auto-rejections, or earn your way to an impossible online assessment. Every path leads to rejection — but at least the journey is fun.',
        href: '/rmh-jobs',
        status: 'Beta',
        cta: 'Browse Jobs',
        isSteam: false,
        gradient: 'from-green-500 via-emerald-400 to-cyan-500',
        iconName: 'Briefcase',
        color: 'from-green-500/20 to-cyan-500/20 hover:border-green-500/50',
        tags: ['Job Board', 'Comedy', 'Beta'],
        imagePath: '/images/games/rmhjobs.png',
        authGate: false,
    },
    {
        id: 'rmh-weather',
        title: 'RMHWeather',
        description: 'A premium, immersive weather experience with real-time data.',
        longDescription:
            'RMHWeather provides accurate real-time weather data, 48-hour forecasts, and 10-day summaries through a stunning glassmorphic interface that reacts to the current conditions.',
        href: '/rmhweather',
        status: 'Released',
        cta: 'Check Weather',
        isSteam: false,
        gradient: 'from-blue-400 via-indigo-500 to-purple-600',
        iconName: 'CloudSun',
        color: 'from-blue-500/20 to-purple-600/20 hover:border-blue-400/50',
        tags: ['Weather', 'Utility', 'Premium'],
        imagePath: '/images/games/rmhweather.png',
        authGate: false,
    },
];
