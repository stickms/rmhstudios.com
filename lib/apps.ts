export interface AppInfo {
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
        cta: 'Watch Together',
        isSteam: false,
        gradient: 'from-red-500 via-pink-500 to-purple-600',
        iconName: 'MonitorPlay',
        color: 'from-red-500/20 to-purple-600/20 hover:border-red-500/50',
        tags: ['Watch Party', 'Real-time', 'Beta'],
        imagePath: '/images/games/rmhtube.webp',
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
        imagePath: '/images/games/rmhdle.webp',
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
        imagePath: '/images/games/rmhconnections.webp',
        authGate: false,
        hidden: true,
    },
    {
        id: 'rmhtype',
        title: 'RMH Type',
        description: 'Test your typing speed solo or race against friends in real-time multiplayer.',
        longDescription:
            'RMH Type is a competitive typing platform. Practice solo to improve your WPM, or create a room to race friends on the same passage simultaneously. Track your progress on the global leaderboard and climb the ranks.',
        href: '/rmhtype',
        cta: 'Start Typing',
        isSteam: false,
        gradient: 'from-emerald-500 via-teal-500 to-cyan-600',
        iconName: 'Keyboard',
        color: 'from-emerald-500/20 to-cyan-600/20 hover:border-emerald-500/50',
        tags: ['Typing', 'Multiplayer', 'Competitive', 'Beta'],
        imagePath: '/images/games/rmhtype.webp',
        authGate: true,
    },
    {
        id: 'rmhmusic',
        title: 'RMHMusic',
        description: 'Listen to Spotify together. Create rooms, share queues, and vibe with friends.',
        longDescription:
            'RMHMusic is a social music player powered by Spotify. Connect your Premium account, create a listening room, and enjoy synced playback with friends. Features a mesmerizing WebGL particle visualizer, shared queues, and real-time chat.',
        href: '/rmhmusic',
        status: 'Beta',
        cta: 'Listen Together',
        isSteam: false,
        gradient: 'from-purple-500 via-violet-500 to-indigo-600',
        iconName: 'Music',
        color: 'from-purple-500/20 to-indigo-600/20 hover:border-purple-500/50',
        tags: ['Music', 'Spotify', 'Real-time', 'Beta'],
        imagePath: '/images/games/rmhmusic.webp',
        authGate: true,
    },
    {
        id: 'rmhstudy',
        title: 'RMH Study',
        description: 'Study together with synced Pomodoro timers, focus tracking, and ambient sounds.',
        longDescription:
            'RMH Study brings the Pomodoro technique to a social setting. Create a study room, invite friends, and stay focused together with synced timers. Track your focus time, set session goals, and climb the study leaderboard.',
        href: '/rmhstudy',
        cta: 'Start Studying',
        isSteam: false,
        gradient: 'from-amber-500 via-orange-500 to-rose-500',
        iconName: 'BookOpen',
        color: 'from-amber-500/20 to-rose-500/20 hover:border-amber-500/50',
        tags: ['Pomodoro', 'Study', 'Productivity', 'Beta'],
        imagePath: '/images/games/rmhstudy.webp',
        authGate: true,
    },
    {
        id: 'rmhcode',
        title: 'rmhcode',
        description: 'AI-powered coding assistant. Build projects with Claude and publish to User Builds.',
        longDescription:
            'rmhcode is a CLI wrapper around Claude Code with RMH integrations. Sign in with your rmhstudios.com account, build projects with AI assistance, and publish your creations to the User Builds showcase.',
        href: '/rmhcode',
        status: 'Beta',
        cta: 'Get Started',
        isSteam: false,
        gradient: 'from-violet-500 via-purple-500 to-fuchsia-600',
        iconName: 'Terminal',
        color: 'from-violet-500/20 to-fuchsia-600/20 hover:border-violet-500/50',
        tags: ['AI', 'CLI', 'Developer Tools', 'Beta'],
        imagePath: '/images/games/rmhcode.webp',
        authGate: true,
    },
];
