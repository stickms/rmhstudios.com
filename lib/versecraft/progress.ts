// ─── Progress Tracking & Storyline Catalog ─────────────────────────────────
// Defines all chapters, character routes, and endings for the progress tab.
// Used by both the ProgressScreen component and the DB sync logic.

export interface ChapterInfo {
  id: string;
  act: number;
  number: number;
  title: string;
}

export interface RouteInfo {
  id: string;
  characterId: string;
  name: string;
  description: string;
  chapters: string[]; // chapter IDs involved in this route
}

export interface EndingInfo {
  id: string;
  name: string;
  route: string; // route ID or 'main' / 'muse'
  description: string; // shown when unlocked; hidden when locked
}

// All chapters across the 7 acts (30 main story + endgame)
export const ALL_CHAPTERS: ChapterInfo[] = [
  // Act 1: Welcome to the Ivory Quill Society
  { id: 'ch01', act: 1, number: 1, title: 'The Society of Inkstained Fingers' },
  { id: 'ch02', act: 1, number: 2, title: 'First Impressions' },
  { id: 'ch03', act: 1, number: 3, title: 'Words Like Weapons' },
  { id: 'ch04', act: 1, number: 4, title: 'The Weight of a Metaphor' },
  { id: 'ch05', act: 1, number: 5, title: 'Thursday Traditions' },
  // Act 2: Deeper Waters
  { id: 'ch06', act: 2, number: 6, title: 'Between the Lines' },
  { id: 'ch07', act: 2, number: 7, title: 'Rivalry and Rhyme' },
  { id: 'ch08', act: 2, number: 8, title: 'The Prompt Box' },
  { id: 'ch09', act: 2, number: 9, title: 'Unwritten Rules' },
  { id: 'ch10', act: 2, number: 10, title: 'A Poem for No One' },
  // Act 3: Fractures
  { id: 'ch11', act: 3, number: 11, title: 'Cracks in the Meter' },
  { id: 'ch12', act: 3, number: 12, title: 'Confessions' },
  { id: 'ch13', act: 3, number: 13, title: 'The Competition' },
  { id: 'ch14', act: 3, number: 14, title: 'Broken Stanzas' },
  { id: 'ch15', act: 3, number: 15, title: 'What the Silence Says' },
  // Act 4: Revelation
  { id: 'ch16', act: 4, number: 16, title: 'Unsent Letters' },
  { id: 'ch17', act: 4, number: 17, title: 'The Freewrite' },
  { id: 'ch18', act: 4, number: 18, title: 'Behind Closed Doors' },
  { id: 'ch19', act: 4, number: 19, title: 'A Line in the Sand' },
  { id: 'ch20', act: 4, number: 20, title: 'The Volta' },
  // Act 5: Meta-Fractures
  { id: 'ch21', act: 5, number: 21, title: 'Glitch in the Margins' },
  { id: 'ch22', act: 5, number: 22, title: 'The Fourth Wall' },
  { id: 'ch23', act: 5, number: 23, title: 'Recursive' },
  { id: 'ch24', act: 5, number: 24, title: 'Who Writes the Writer?' },
  { id: 'ch25', act: 5, number: 25, title: 'Erasure' },
  // Act 6: The Muse Speaks
  { id: 'ch26', act: 6, number: 26, title: 'Dear Author' },
  { id: 'ch27', act: 6, number: 27, title: 'The Final Stanza' },
  { id: 'ch28', act: 6, number: 28, title: 'Liberation' },
  // Act 7: Endgame
  { id: 'ch29', act: 7, number: 29, title: 'New Game Plus' },
  { id: 'ch30', act: 7, number: 30, title: 'The Last Poem' },
];

// Character routes (6 romanceable characters + The Muse secret route)
export const ALL_ROUTES: RouteInfo[] = [
  {
    id: 'luna', characterId: 'luna', name: 'Luna Voss',
    description: 'The Romantic poet who writes by moonlight.',
    chapters: ['ch01', 'ch06', 'ch11', 'ch16', 'ch21', 'ch26'],
  },
  {
    id: 'kai', characterId: 'kai', name: 'Kai Nakamura',
    description: 'The Dadaist who turns rules into art.',
    chapters: ['ch01', 'ch06', 'ch11', 'ch16', 'ch21', 'ch26'],
  },
  {
    id: 'rowan', characterId: 'rowan', name: 'Rowan Hart',
    description: 'The Imagist who finds beauty in simplicity.',
    chapters: ['ch01', 'ch06', 'ch11', 'ch16', 'ch21', 'ch26'],
  },
  {
    id: 'sable', characterId: 'sable', name: 'Sable Okafor',
    description: 'The Spoken Word artist who speaks truth to power.',
    chapters: ['ch06', 'ch11', 'ch16', 'ch21', 'ch26'],
  },
  {
    id: 'milo', characterId: 'milo', name: 'Milo Vance',
    description: 'The Formalist who finds freedom in structure.',
    chapters: ['ch01', 'ch06', 'ch11', 'ch16', 'ch21', 'ch26'],
  },
  {
    id: 'wren', characterId: 'wren', name: 'Wren Delacroix',
    description: 'The Surrealist who dreams in verse.',
    chapters: ['ch06', 'ch11', 'ch16', 'ch21', 'ch26'],
  },
  {
    id: 'muse', characterId: 'muse', name: 'The Muse',
    description: '???',
    chapters: ['ch21', 'ch22', 'ch23', 'ch24', 'ch25', 'ch26', 'ch27', 'ch28'],
  },
];

// All 12 endings
export const ALL_ENDINGS: EndingInfo[] = [
  // Character True Endings (romance completed + high affinity)
  { id: 'luna_true', name: 'Moonlit Devotion', route: 'luna', description: 'Luna finds peace in your shared verses.' },
  { id: 'kai_true', name: 'Beautiful Nonsense', route: 'kai', description: 'Kai writes a poem that finally makes sense — about you.' },
  { id: 'rowan_true', name: 'Still Water', route: 'rowan', description: 'Rowan composes a haiku at sunrise. It says everything.' },
  { id: 'sable_true', name: 'Unsilenced', route: 'sable', description: 'Sable performs your poem at the championship. Standing ovation.' },
  { id: 'milo_true', name: 'Perfect Meter', route: 'milo', description: 'Milo breaks his own rules to write you a free-verse love letter.' },
  { id: 'wren_true', name: 'Lucid Dream', route: 'wren', description: 'Wren paints a world where you both stay forever.' },
  // Main Story Endings
  { id: 'main_good', name: 'The Society Lives On', route: 'main', description: 'The Ivory Quill Society thrives. Poetry endures.' },
  { id: 'main_bittersweet', name: 'Last Meeting', route: 'main', description: 'The society dissolves, but the friendships remain.' },
  { id: 'main_solo', name: 'The Solitary Poet', route: 'main', description: 'You walk away from the society, but your poems carry them with you.' },
  // Meta / Muse Endings
  { id: 'muse_liberation', name: 'Set Them Free', route: 'muse', description: 'You release the characters from the story. The screen goes dark.' },
  { id: 'muse_authorship', name: 'Claim Authorship', route: 'muse', description: 'You become the author. The Muse smiles.' },
  { id: 'muse_secret', name: '???', route: 'muse', description: 'Unlocked by completing all other endings.' },
];

// ─── Helper Functions ───────────────────────────────────────────────────────

export interface ProgressData {
  completedChapters: string[];
  unlockedEndings: string[];
  completedRoutes: string[];
  totalPoemsWritten: number;
  totalPlaytime: number;
}

export const DEFAULT_PROGRESS: ProgressData = {
  completedChapters: [],
  unlockedEndings: [],
  completedRoutes: [],
  totalPoemsWritten: 0,
  totalPlaytime: 0,
};

export function getProgressPercentage(progress: ProgressData): number {
  const chapterWeight = 0.5;
  const endingWeight = 0.35;
  const routeWeight = 0.15;

  const chapterPct = progress.completedChapters.length / ALL_CHAPTERS.length;
  const endingPct = progress.unlockedEndings.length / ALL_ENDINGS.length;
  const routePct = progress.completedRoutes.length / ALL_ROUTES.length;

  return Math.round((chapterPct * chapterWeight + endingPct * endingWeight + routePct * routeWeight) * 100);
}

export function isEndingUnlocked(endingId: string, progress: ProgressData): boolean {
  return progress.unlockedEndings.includes(endingId);
}

export function isChapterCompleted(chapterId: string, progress: ProgressData): boolean {
  return progress.completedChapters.includes(chapterId);
}

export function isRouteCompleted(routeId: string, progress: ProgressData): boolean {
  return progress.completedRoutes.includes(routeId);
}

export function getActNumber(chapterId: string): number {
  return ALL_CHAPTERS.find(c => c.id === chapterId)?.act ?? 0;
}
