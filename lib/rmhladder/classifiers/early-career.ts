export type ProgramType =
  | 'internship' | 'summer_analyst' | 'summer_associate' | 'analyst_program'
  | 'rotational_program' | 'new_grad' | 'leadership_development' | 'entry_level' | 'mba' | 'other';

export interface EarlyCareerResult {
  score: number;
  classification: 'yes' | 'probable' | 'no' | 'unclear';
  programType: ProgramType;
  graduationYearTarget: number | null;
  schoolYearTarget: string | null;
}

// [pattern, weight] — title matches count double
const POSITIVE: Array<[RegExp, number]> = [
  [/\bsummer analyst\b/i, 40], [/\bsummer associate\b/i, 40], [/\bintern(ship)?\b/i, 35],
  [/\bnew grad(uate)?\b/i, 35], [/\brotational (analyst )?program\b/i, 35],
  [/\bleadership development program\b/i, 35], [/\banalyst (development )?program\b/i, 30],
  [/\bearly careers?\b/i, 30], [/\bcampus\b/i, 20], [/\buniversity program\b/i, 25],
  [/\bentry[- ]level\b/i, 25], [/\brecent graduates?\b/i, 25], [/\bstudents?\b/i, 15],
  [/\bassociate consultant\b/i, 25], [/\bbusiness analyst\b/i, 15],
  [/\b(sophomore|junior|senior year|freshman)\b/i, 20], [/\bmba intern\b/i, 30],
  [/\bclass of 20(2[5-9]|3[0-2])\b/i, 25], [/\b20(2[5-9]|3[0-2])\b/, 10],
];
const NEGATIVE: Array<[RegExp, number]> = [
  [/\bvice president\b|\bvp\b/i, 60], [/\b(executive|managing) director\b/i, 60],
  [/\bdirector\b/i, 50], [/\bprincipal\b/i, 50], [/\bhead of\b/i, 45],
  [/\bsenior\b(?! year)/i, 30], [/\bstaff (engineer|scientist)\b/i, 40], [/\blead\b/i, 25],
  [/\bmanager\b/i, 25], [/\bexpert\b/i, 25], [/\bexperienced professional\b/i, 40],
  [/\blateral\b/i, 30], [/\b([5-9]|1[0-9])\+? ?(years|yrs)\b/i, 45],
];
// order matters: first match wins
const PROGRAM_TYPES: Array<[RegExp, ProgramType]> = [
  [/\bmba intern\b/i, 'mba'],
  [/\bsummer analyst\b/i, 'summer_analyst'],
  [/\bsummer associate\b/i, 'summer_associate'],
  [/\brotational\b/i, 'rotational_program'],
  [/\bleadership development\b/i, 'leadership_development'],
  [/\banalyst (development )?program\b/i, 'analyst_program'],
  [/\bnew grad(uate)?\b/i, 'new_grad'],
  [/\bintern(ship)?\b/i, 'internship'],
  [/\bentry[- ]level\b/i, 'entry_level'],
  [/\bmba\b/i, 'mba'],
];
const SCHOOL_YEARS = /\b(freshman|sophomore|junior|senior)\b/i;

export function classifyEarlyCareer(title: string, description = ''): EarlyCareerResult {
  const text = `${title}\n${description}`;
  let score = 0;
  let hasNegative = false;
  for (const [re, w] of POSITIVE) {
    if (re.test(title)) score += w;           // title hit: full weight
    else if (re.test(description)) score += Math.floor(w / 2);
  }
  for (const [re, w] of NEGATIVE) {
    if (re.test(title)) { score -= w; hasNegative = true; }
    else if (re.test(description)) { score -= Math.floor(w / 2); hasNegative = true; }
  }
  score = Math.max(0, Math.min(100, score));

  // unambiguous program markers in the title floor the score
  const strongTitle = /\b(summer analyst|summer associate|new grad(uate)?|early careers?|intern(ship)?|rotational)\b/i;
  if (strongTitle.test(title)) score = Math.max(score, 75);

  let classification: EarlyCareerResult['classification'];
  if (score >= 70) classification = 'yes';
  else if (score >= 50) classification = 'probable';
  else if (hasNegative && score <= 25) classification = 'no';
  else classification = 'unclear';
  // hard negatives in the title always kill it unless an explicit program marker is also in the title
  const hardNeg = /\b(vice president|managing director|executive director|senior(?! year)|director|principal|manager|head of|staff engineer)\b/i;
  const hardPos = /\b(summer analyst|summer associate|intern(ship)?|new grad|early careers?|rotational|campus)\b/i;
  if (hardNeg.test(title) && !hardPos.test(title)) classification = 'no';

  const programType = PROGRAM_TYPES.find(([re]) => re.test(text))?.[1] ?? 'other';
  const gradMatch = text.match(/\b(20(2[5-9]|3[0-2]))\b/);
  const schoolMatch = text.match(SCHOOL_YEARS);
  return {
    score,
    classification,
    programType,
    graduationYearTarget: gradMatch ? Number(gradMatch[1]) : null,
    schoolYearTarget: schoolMatch ? schoolMatch[1].toLowerCase() : null,
  };
}
