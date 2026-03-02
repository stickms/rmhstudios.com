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
        id: 'rmhtype',
        title: 'RMH Type',
        description: 'Test your typing speed solo or race against friends in real-time multiplayer.',
        longDescription:
            'RMH Type is a competitive typing platform. Practice solo to improve your WPM, or create a room to race friends on the same passage simultaneously. Track your progress on the global leaderboard and climb the ranks.',
        href: '/rmhtype',
        status: 'Beta',
        cta: 'Start Typing',
        isSteam: false,
        gradient: 'from-emerald-500 via-teal-500 to-cyan-600',
        iconName: 'Keyboard',
        color: 'from-emerald-500/20 to-cyan-600/20 hover:border-emerald-500/50',
        tags: ['Typing', 'Multiplayer', 'Competitive', 'Beta'],
        imagePath: '/images/games/rmhtype.png',
        authGate: true,
    },
    {
        id: 'rmhbrowser',
        title: 'RMHbrowser',
        description: 'A full-featured web browser with tabs, bookmarks, history, and multiple themes.',
        longDescription:
            'RMHbrowser is a web-app internet browser built right into the platform. Browse the web with a tabbed interface, save bookmarks, track history, customize your experience with five themes, and manage multiple profiles — all without leaving RMH Studios.',
        href: '/rmhbrowser',
        status: 'Beta',
        cta: 'Start Browsing',
        isSteam: false,
        gradient: 'from-indigo-500 via-violet-500 to-purple-600',
        iconName: 'Globe',
        color: 'from-indigo-500/20 to-purple-600/20 hover:border-indigo-500/50',
        tags: ['Browser', 'Utility', 'Productivity', 'Beta'],
        imagePath: '/images/games/rmhbrowser.png',
        authGate: true,
    },
    {
        id: 'rmhstudy',
        title: 'RMH Study',
        description: 'Study together with synced Pomodoro timers, focus tracking, and ambient sounds.',
        longDescription:
            'RMH Study brings the Pomodoro technique to a social setting. Create a study room, invite friends, and stay focused together with synced timers. Track your focus time, set session goals, and climb the study leaderboard.',
        href: '/rmhstudy',
        status: 'Beta',
        cta: 'Start Studying',
        isSteam: false,
        gradient: 'from-amber-500 via-orange-500 to-rose-500',
        iconName: 'BookOpen',
        color: 'from-amber-500/20 to-rose-500/20 hover:border-amber-500/50',
        tags: ['Pomodoro', 'Study', 'Productivity', 'Beta'],
        imagePath: '/images/games/rmhstudy.png',
        authGate: true,
    },
];
