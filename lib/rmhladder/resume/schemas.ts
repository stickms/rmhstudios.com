import { z } from 'zod';

export const RESUME_MAX_BYTES = 10 * 1024 * 1024;
export const RESUME_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
] as const;

export const resumeMimeTypeSchema = z.enum(RESUME_MIME_TYPES);

const shortText = z.string().trim().min(1).max(160);
const optionalShortText = z.string().trim().max(160).nullable().default(null);

export const educationEntrySchema = z.object({
  degree: optionalShortText,
  field: optionalShortText,
  school: optionalShortText,
  graduationYear: z.number().int().min(1950).max(2100).nullable().default(null),
});

export const workEntrySchema = z.object({
  title: shortText,
  company: optionalShortText,
  startYear: z.number().int().min(1950).max(2100).nullable().default(null),
  endYear: z.number().int().min(1950).max(2100).nullable().default(null),
  current: z.boolean().default(false),
  bullets: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
});

export const candidateProfileSchema = z.object({
  headline: z.string().trim().max(200).default(''),
  summary: z.string().trim().max(1500).default(''),
  skills: z.array(shortText).max(120).default([]),
  yearsExperience: z.number().min(0).max(60).nullable().default(null),
  education: z.array(educationEntrySchema).max(12).default([]),
  workHistory: z.array(workEntrySchema).max(30).default([]),
  certifications: z.array(shortText).max(30).default([]),
  locations: z.array(shortText).max(20).default([]),
  rolePreferences: z.array(shortText).max(30).default([]),
});

export type CandidateProfile = z.infer<typeof candidateProfileSchema>;

export const reviewIssueSchema = z.object({
  severity: z.enum(['high', 'medium', 'low']),
  category: z.enum(['content', 'clarity', 'impact', 'format', 'ats', 'consistency', 'privacy']),
  message: z.string().trim().min(1).max(500),
  suggestion: z.string().trim().min(1).max(700),
});

export const resumeReviewSchema = z.object({
  overallScore: z.number().int().min(0).max(100),
  summary: z.string().trim().min(1).max(1200),
  strengths: z.array(z.string().trim().min(1).max(400)).max(12).default([]),
  issues: z.array(reviewIssueSchema).max(25).default([]),
  improvedBullets: z.array(z.string().trim().min(1).max(700)).max(12).default([]),
  atsKeywords: z.array(shortText).max(60).default([]),
});

export type ResumeReview = z.infer<typeof resumeReviewSchema>;

export const resumeAnalysisSchema = z.object({
  profile: candidateProfileSchema,
  review: resumeReviewSchema,
});

export type ResumeAnalysis = z.infer<typeof resumeAnalysisSchema>;

export const jobProfileSchema = z.object({
  title: shortText,
  company: optionalShortText,
  summary: z.string().trim().max(1600).default(''),
  requiredSkills: z.array(shortText).max(100).default([]),
  preferredSkills: z.array(shortText).max(100).default([]),
  keywords: z.array(shortText).max(100).default([]),
  responsibilities: z.array(z.string().trim().min(1).max(500)).max(30).default([]),
  minYearsExperience: z.number().min(0).max(60).nullable().default(null),
  maxYearsExperience: z.number().min(0).max(60).nullable().default(null),
  educationLevels: z.array(shortText).max(12).default([]),
  locations: z.array(shortText).max(30).default([]),
  remoteStatus: z.enum(['onsite', 'hybrid', 'remote_us']).default('onsite'),
  programType: z.string().trim().max(80).nullable().default(null),
  earlyCareer: z.boolean().default(false),
});

export type JobProfile = z.infer<typeof jobProfileSchema>;

export const matchBreakdownSchema = z.object({
  skills: z.number().int().min(0).max(35),
  roleFamily: z.number().int().min(0).max(20),
  experience: z.number().int().min(0).max(15),
  education: z.number().int().min(0).max(10),
  location: z.number().int().min(0).max(10),
  preferences: z.number().int().min(0).max(10),
});

export const jobMatchSchema = z.object({
  score: z.number().int().min(0).max(100),
  confidence: z.number().int().min(0).max(100),
  breakdown: matchBreakdownSchema,
  matchedSkills: z.array(shortText).max(100),
  missingSkills: z.array(shortText).max(100),
  explanation: z.string().trim().min(1).max(1200),
});

export type JobMatch = z.infer<typeof jobMatchSchema>;

export const resumeIdParamsSchema = z.object({ id: z.string().trim().min(1).max(100) });
export const analyzeResumeSchema = z.object({
  versionId: z.string().trim().min(1).max(100),
});

export const resumeListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  activeVersionId: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  versions: z.array(z.object({
    id: z.string(),
    versionNumber: z.number().int(),
    filename: z.string(),
    mimeType: z.string(),
    sizeBytes: z.number().int(),
    createdAt: z.coerce.date(),
  })).default([]),
});

export type ResumeListItem = z.infer<typeof resumeListItemSchema>;
