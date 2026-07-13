import { describe, expect, it } from 'vitest';
import { profileJobDeterministically } from './job-profile';

describe('profileJobDeterministically', () => {
  it('extracts explicit requirements without making AI calls', () => {
    const result = profileJobDeterministically({
      title: 'Software Engineer Intern', company: { name: 'Acme' }, city: 'New York', state: 'NY', remoteStatus: 'hybrid', programType: 'internship', earlyCareerClassification: 'yes',
      fullDescription: '<p>Minimum qualifications: 1+ years using TypeScript and SQL. Preferred: AWS and Docker. Bachelor\'s degree.</p>',
    });
    expect(result.requiredSkills).toEqual(expect.arrayContaining(['TypeScript', 'SQL']));
    expect(result.preferredSkills).toEqual(expect.arrayContaining(['AWS', 'Docker']));
    expect(result.minYearsExperience).toBe(1);
    expect(result.educationLevels).toEqual(['Bachelor']);
    expect(result.earlyCareer).toBe(true);
    expect(result.programType).toBe('internship');
  });
});
