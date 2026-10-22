/**
 * P8 — the fixed skill list members can be endorsed for. A constant on purpose:
 * free-text skills turn into a moderation surface and a spam vector, and a fixed
 * list makes the counts comparable across members.
 *
 * The id is what is stored (`SkillEndorsement.skill`); the label is the English
 * default, and the UI looks it up through `t('skill-<id>', { defaultValue })`.
 */
export const SKILLS = [
  { id: 'beatmaking', label: 'Beatmaking' },
  { id: 'music-production', label: 'Music production' },
  { id: 'pixel-art', label: 'Pixel art' },
  { id: 'illustration', label: 'Illustration' },
  { id: '3d-modelling', label: '3D modelling' },
  { id: 'level-design', label: 'Level design' },
  { id: 'game-design', label: 'Game design' },
  { id: 'programming', label: 'Programming' },
  { id: 'writing', label: 'Writing' },
  { id: 'video-editing', label: 'Video editing' },
  { id: 'streaming', label: 'Streaming' },
  { id: 'speedrunning', label: 'Speedrunning' },
  { id: 'modding', label: 'Modding' },
  { id: 'community-building', label: 'Community building' },
  { id: 'translation', label: 'Translation' },
  { id: 'teaching', label: 'Teaching' },
] as const;

export type SkillId = (typeof SKILLS)[number]['id'];

const IDS: ReadonlySet<string> = new Set(SKILLS.map((s) => s.id));

export function isSkillId(value: string): value is SkillId {
  return IDS.has(value);
}

export function skillLabel(id: string): string {
  return SKILLS.find((s) => s.id === id)?.label ?? id;
}

/** Skills shown at most this many at a time before "show all". */
export const SKILLS_VISIBLE = 8;
