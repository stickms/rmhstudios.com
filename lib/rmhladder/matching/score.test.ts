import { describe, expect, it } from 'vitest';
import { scoreCandidateForJob } from './score';
import type { CandidateProfile, JobProfile } from '../resume/schemas';

const candidate: CandidateProfile = {
  headline: 'Software engineering intern', summary: '',
  skills: ['JS', 'React', 'Postgres', 'AWS'], yearsExperience: 2,
  education: [{ degree: 'Bachelor of Science', field: 'Computer Science', school: 'State University', graduationYear: 2027 }],
  workHistory: [{ title: 'Software Engineering Intern', company: 'Acme', startYear: 2025, endYear: 2025, current: false, bullets: [] }],
  certifications: [], locations: ['New York'], rolePreferences: ['Software Engineer'],
};

const job: JobProfile = {
  title: 'Software Engineer Intern', company: 'Example', summary: '',
  requiredSkills: ['JavaScript', 'React', 'PostgreSQL'], preferredSkills: ['Amazon Web Services'],
  keywords: ['software engineering'], responsibilities: [], minYearsExperience: 1, maxYearsExperience: 3,
  educationLevels: ['Bachelor'], locations: ['New York'], remoteStatus: 'hybrid', programType: 'internship', earlyCareer: true,
};

describe('scoreCandidateForJob', () => {
  it('scores deterministically and normalizes common skill aliases', () => {
    const first = scoreCandidateForJob(candidate, job);
    const second = scoreCandidateForJob(candidate, job);
    expect(first).toEqual(second);
    expect(first.missingSkills).toEqual([]);
    expect(first.matchedSkills).toEqual(expect.arrayContaining(['JavaScript', 'React', 'PostgreSQL', 'Amazon Web Services']));
    expect(first.score).toBeGreaterThanOrEqual(80);
    expect(first.confidence).toBe(100);
  });

  it('penalizes missing required skills without inventing a match', () => {
    const result = scoreCandidateForJob({ ...candidate, skills: ['Excel'] }, job);
    expect(result.missingSkills).toEqual(['JavaScript', 'React', 'PostgreSQL']);
    expect(result.score).toBeLessThan(50);
  });

  it('uses lower confidence when key profile data is absent', () => {
    const result = scoreCandidateForJob({ ...candidate, skills: [], yearsExperience: null, education: [], workHistory: [] }, { ...job, requiredSkills: [], preferredSkills: [], minYearsExperience: null, locations: [] });
    expect(result.confidence).toBeLessThan(50);
  });

  it('reserves ten points for existing user preferences', () => {
    const preferred = scoreCandidateForJob(candidate, job, {
      preferredCities: ['New York'], preferredProgramTypes: ['internship'], boostKeywords: ['software'],
    });
    const mismatched = scoreCandidateForJob(candidate, job, {
      preferredCities: ['Chicago'], preferredProgramTypes: ['mba'], boostKeywords: ['accounting'],
    });
    expect(preferred.breakdown.preferences).toBe(10);
    expect(mismatched.breakdown.preferences).toBe(0);
    expect(preferred.score - mismatched.score).toBe(10);
  });
});
