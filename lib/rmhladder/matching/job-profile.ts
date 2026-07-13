import { jobProfileSchema } from '../resume/schemas';
import type { JobProfile } from '../resume/schemas';

const SKILLS = [
  'JavaScript', 'TypeScript', 'React', 'Node.js', 'Python', 'Java', 'C++', 'C#', 'Go', 'Rust', 'Ruby',
  'SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'AWS', 'Azure', 'Google Cloud', 'Docker', 'Kubernetes',
  'Git', 'Linux', 'Excel', 'PowerPoint', 'Tableau', 'Power BI', 'Salesforce', 'Figma',
  'Machine Learning', 'Artificial Intelligence', 'Data Analysis', 'Financial Modeling', 'Valuation',
  'Accounting', 'Bloomberg', 'Capital Markets', 'Investment Banking', 'Project Management', 'Agile', 'Scrum',
] as const;

const REQUIRED_CONTEXT = /\b(required|must have|minimum qualifications?|what you need|basic qualifications?)\b/i;
const PREFERRED_CONTEXT = /\b(preferred|nice to have|bonus|desired)\b/i;

function includesSkill(text: string, skill: string): boolean {
  const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(text);
}

function classifySkills(text: string): { required: string[]; preferred: string[] } {
  const required: string[] = [];
  const preferred: string[] = [];
  const paragraphs = text.split(/\n{2,}|(?<=[.!?])\s+/);
  for (const skill of SKILLS) {
    const hit = paragraphs.find((part) => includesSkill(part, skill));
    if (!hit) continue;
    if (PREFERRED_CONTEXT.test(hit)) preferred.push(skill);
    else if (REQUIRED_CONTEXT.test(hit)) required.push(skill);
    else preferred.push(skill);
  }
  return { required, preferred: preferred.filter((skill) => !required.includes(skill)) };
}

export interface LadderJobForProfile {
  title: string;
  descriptionSummary?: string | null;
  fullDescription?: string | null;
  locationRaw?: string | null;
  city?: string | null;
  state?: string | null;
  remoteStatus?: 'onsite' | 'hybrid' | 'remote_us' | null;
  earlyCareerClassification?: string | null;
  programType?: string | null;
  company?: { name?: string | null } | null;
}

export function profileJobDeterministically(job: LadderJobForProfile): JobProfile {
  const raw = job.fullDescription ?? job.descriptionSummary ?? '';
  const text = raw.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/\s+/g, ' ').trim();
  const skills = classifySkills(text);
  const years = [...text.matchAll(/\b(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?\+?\s+years?\b/gi)]
    .map((match) => ({ min: Number(match[1]), max: match[2] ? Number(match[2]) : null }))
    .filter((value) => value.min <= 60);
  const locations = [[job.city, job.state].filter(Boolean).join(', '), job.locationRaw ?? '']
    .map((value) => value.trim()).filter(Boolean);

  return jobProfileSchema.parse({
    title: job.title,
    company: job.company?.name ?? null,
    summary: (job.descriptionSummary ?? text).slice(0, 1600),
    requiredSkills: skills.required,
    preferredSkills: skills.preferred,
    keywords: [],
    responsibilities: [],
    minYearsExperience: years.length ? Math.min(...years.map((value) => value.min)) : null,
    maxYearsExperience: years.map((value) => value.max).find((value): value is number => value !== null) ?? null,
    educationLevels: /\bbachelor'?s|\bba\b|\bbs\b/i.test(text) ? ['Bachelor'] : [],
    locations: [...new Set(locations)],
    remoteStatus: job.remoteStatus ?? 'onsite',
    programType: job.programType ?? null,
    earlyCareer: job.earlyCareerClassification === 'yes' || job.earlyCareerClassification === 'probable',
  });
}
