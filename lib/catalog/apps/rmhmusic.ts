import type { AppInfo } from '../types';

const entry: AppInfo =
  {
    id: 'rmhmusic',
    order: 40,
    title:
      'RMH Music',
    description:
      'Learn piano and guitar by playing into a microphone, MIDI keyboard, computer keyboard or on-screen keys. Read notes with spaced repetition, find them on the fretboard and keyboard, match pitch, train your ear for intervals and chords, play chords, and practise rhythm with a metronome.',
    longDescription:
      'RMH Music teaches piano and guitar from the first note. Pick an instrument and play into a microphone, a MIDI keyboard, your computer keyboard or the on-screen keys; the app calibrates the delay of your input and hears what you play. The path has lessons for reading notes on the staff with spaced-repetition flashcards, finding notes on the fretboard and the keyboard, matching a pitch you see or hear, telling intervals and chords apart by ear, playing a chord, and keeping time with a metronome and rhythm exercises. Your progress is saved to your account. It is a Beta and more lessons are still to come.',
    href: '/rmhmusic',
    status:
      'Beta',
    cta: 'Start Learning',
    isSteam: false,
    gradient:
      'from-purple-500 via-violet-500 to-indigo-600',
    iconName:
      'Music',
    color:
      'from-purple-500/20 to-indigo-600/20 hover:border-purple-500/50',
    tags: [
      'Music',
      'Learning',
      'Piano',
      'Guitar',
      'MIDI',
      'Beta',
    ],
    imagePath:
      '/images/games/rmhmusic.webp',
    bannerPath:
      '/images/games/banners/rmhmusic.webp',
    logoPath:
      '/images/games/logos/rmhmusic.webp',
    ogImagePath:
      '/images/og/rmhmusic.png',
    ogImageAlt:
      'Hand-ruled manuscript paper with the RMH Music wordmark above the first bars of Ode to Joy, written on a staff with guitar tab beneath.',
    authGate: true,
  };

export default entry;
