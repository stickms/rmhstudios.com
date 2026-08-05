import type { AppInfo } from '../types';

const entry: AppInfo = {
  id: 'rmhstudy',
  order: 50,
  title: 'RMH Study',
  description: 'Study together with synced Pomodoro timers, focus tracking, and flashcards.',
  longDescription:
    'RMH Study brings the Pomodoro technique to a social setting. Create a study room, invite friends, and stay focused together with synced timers. Track your focus time, set session goals, climb the study leaderboard, and drill solo with flashcard decks and an AI tutor.',
  href: '/rmhstudy',
  cta: 'Start Studying',
  isSteam: false,
  gradient: 'from-amber-500 via-orange-500 to-rose-500',
  iconName: 'BookOpen',
  color: 'from-amber-500/20 to-rose-500/20 hover:border-amber-500/50',
  tags: ['Pomodoro', 'Study', 'Productivity', 'Beta'],
  imagePath: '/images/games/rmhstudy.webp',
  authGate: true,
};

export default entry;
