import { describe, expect, it } from 'vitest';
import { classifyEarlyCareer } from './early-career';

describe('classifyEarlyCareer', () => {
  it('summer analyst is a clear yes with program type', () => {
    const r = classifyEarlyCareer('Investment Banking Summer Analyst 2027');
    expect(r.classification).toBe('yes');
    expect(r.programType).toBe('summer_analyst');
    expect(r.graduationYearTarget).toBe(2027);
  });
  it('intern titles classify yes/internship', () => {
    expect(classifyEarlyCareer('Software Engineering Intern')).toMatchObject({
      classification: 'yes', programType: 'internship',
    });
  });
  it('senior titles are no', () => {
    expect(classifyEarlyCareer('Senior Software Engineer').classification).toBe('no');
    expect(classifyEarlyCareer('Vice President, Corporate Development').classification).toBe('no');
    expect(classifyEarlyCareer('Managing Director - M&A').classification).toBe('no');
  });
  it('experience requirements in description push to no', () => {
    const r = classifyEarlyCareer('Strategy Associate', 'Requires 7+ years of consulting experience.');
    expect(r.classification).toBe('no');
  });
  it('program types are detected in priority order', () => {
    expect(classifyEarlyCareer('2026 Rotational Analyst Program').programType).toBe('rotational_program');
    expect(classifyEarlyCareer('Finance Leadership Development Program').programType).toBe('leadership_development');
    expect(classifyEarlyCareer('New Grad Software Engineer').programType).toBe('new_grad');
    expect(classifyEarlyCareer('MBA Summer Associate').programType).toBe('summer_associate');
    expect(classifyEarlyCareer('Product Management MBA Intern').programType).toBe('mba');
  });
  it('school year target detected', () => {
    const r = classifyEarlyCareer('Sophomore Summer Analyst Program', 'Open to current sophomores.');
    expect(r.schoolYearTarget).toBe('sophomore');
  });
  it('ambiguous titles are unclear', () => {
    const r = classifyEarlyCareer('Operations Specialist');
    expect(r.classification).toBe('unclear');
  });
  it('manager alone is negative but "program manager, early careers" recovers', () => {
    expect(classifyEarlyCareer('Engineering Manager').classification).toBe('no');
    expect(classifyEarlyCareer('Analyst, Early Careers Program').classification).toBe('yes');
  });
});
