import type { GameInfo } from '../types';

const entry: GameInfo = {
  id: 'bums-rush',
  order: 220,
  title: "Bum's Rush",
  description:
    'A hand-drawn physics party game: you are a head with two long arms. Grab, swing, and fling your friends across eight worlds — 1–4 players, online or on one screen.',
  longDescription:
    "You are a head with two enormous arms and no legs whatsoever. Grab a ledge, swing, let go at exactly the wrong moment, and paint the wall. Bum's Rush is a hand-drawn physics party game for one to four players: link hands into a living rope, haul each other over gaps none of you could cross alone, and argue about whose fault it was. Eight themed worlds with hidden objectives, and a Showdown mode for when co-operation has run its course. Plays online, on one screen, or both at once — with a gamepad, a keyboard, or two thumbs.",
  href: '/bums-rush',
  cta: 'Get a Grip',
  isSteam: false,
  gradient: 'from-amber-400 to-rose-500',
  iconName: 'Hand',
  color: 'from-amber-400/20 to-rose-500/20 hover:border-amber-400/50',
  tags: ['Party', 'Multiplayer', 'Physics', 'Platformer'],
  authGate: false,
  // Hidden from /games until it is playable — the route currently renders a
  // title screen while the engine, worlds and multiplayer land. Reachable by
  // direct link so it can be reviewed. Remove this line in the commit that
  // makes the game playable, along with the `status` badge below.
  unlisted: true,
  status: 'In development',
};

export default entry;
