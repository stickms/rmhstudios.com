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
