/**
 * General interview questions (roadmap item 6): questions an applicant may be asked at any school, so they carry no
 * school key. A static, versioned module rather than a table: nothing about them is per user or per school, and a change
 * of wording is a code change like any other. Written for RMH. The text is also the i18n default (`gq-<id>`), so a
 * reworded question needs a new id. Pure; imports nothing.
 *
 * Bump `GENERAL_QUESTIONS_VERSION` when a question is added, removed or reworded.
 */

export const GENERAL_QUESTIONS_VERSION = 1;

/** `REG` is MD or DO, `PHD` is MD-PhD or DO-PhD (the same two programs as everywhere else in the app). */
export const GENERAL_PROGRAMS = ['REG', 'PHD'] as const;
export type GeneralProgram = (typeof GENERAL_PROGRAMS)[number];

export const GENERAL_CATEGORIES = [
  'motivation',
  'about-you',
  'ethics',
  'teamwork',
  'resilience',
  'healthcare',
  'research',
  'career',
] as const;
export type GeneralCategory = (typeof GENERAL_CATEGORIES)[number];

export interface GeneralQuestion {
  /** Stable, lower-case, kebab. Never reused for different wording. */
  id: string;
  program: GeneralProgram;
  category: GeneralCategory;
  text: string;
}

export const GENERAL_QUESTIONS: readonly GeneralQuestion[] = [
  // ---- REG: motivation
  { id: 'reg-why-medicine', program: 'REG', category: 'motivation', text: 'Why do you want to practise medicine?' },
  {
    id: 'reg-why-not-other',
    program: 'REG',
    category: 'motivation',
    text: 'What other careers did you consider, and why did you choose medicine over them?',
  },
  {
    id: 'reg-moment',
    program: 'REG',
    category: 'motivation',
    text: 'Describe one moment that made you sure this is the right path.',
  },
  {
    id: 'reg-why-here-type',
    program: 'REG',
    category: 'motivation',
    text: 'What are you looking for in a medical school, and what kind of training will suit you best?',
  },
  // ---- REG: about you
  { id: 'reg-tell-me', program: 'REG', category: 'about-you', text: 'Tell me about yourself.' },
  {
    id: 'reg-strengths',
    program: 'REG',
    category: 'about-you',
    text: 'What are your two greatest strengths, and how have they shown up in your work with other people?',
  },
  {
    id: 'reg-weakness',
    program: 'REG',
    category: 'about-you',
    text: 'Name a weakness you are working on. What have you done about it so far?',
  },
  {
    id: 'reg-other-applicant',
    program: 'REG',
    category: 'about-you',
    text: 'What would you want the committee to know about you that is not in your application?',
  },
  {
    id: 'reg-ten-years',
    program: 'REG',
    category: 'about-you',
    text: 'Where do you picture yourself ten years after graduating?',
  },
  // ---- REG: ethics
  {
    id: 'reg-ethics-refuse',
    program: 'REG',
    category: 'ethics',
    text: 'A competent patient refuses a treatment you believe would help them. What do you do, and why?',
  },
  {
    id: 'reg-ethics-error',
    program: 'REG',
    category: 'ethics',
    text: 'You notice a teammate made a medication error that has not yet reached the patient. Walk me through your next steps.',
  },
  {
    id: 'reg-ethics-family',
    program: 'REG',
    category: 'ethics',
    text: 'A family asks you to keep a serious diagnosis from the patient. How do you respond?',
  },
  {
    id: 'reg-ethics-resources',
    program: 'REG',
    category: 'ethics',
    text: 'Two patients need the same scarce resource and only one can have it. How would you think about the decision?',
  },
  // ---- REG: teamwork
  {
    id: 'reg-team-conflict',
    program: 'REG',
    category: 'teamwork',
    text: 'Tell me about a disagreement with someone you worked with. How did it end, and what would you change?',
  },
  {
    id: 'reg-team-lead',
    program: 'REG',
    category: 'teamwork',
    text: 'Describe a time you led without having the title. What did you do?',
  },
  {
    id: 'reg-team-feedback',
    program: 'REG',
    category: 'teamwork',
    text: 'Tell me about feedback that was hard to hear. What did you do with it?',
  },
  // ---- REG: resilience
  {
    id: 'reg-fail',
    program: 'REG',
    category: 'resilience',
    text: 'Describe a time you failed at something that mattered to you. What came next?',
  },
  {
    id: 'reg-stress',
    program: 'REG',
    category: 'resilience',
    text: 'Medical school is demanding. How do you keep going when the workload and the stress are both high?',
  },
  {
    id: 'reg-gap',
    program: 'REG',
    category: 'resilience',
    text: 'Is there anything in your record, such as a grade, a gap or a retake, that you would like to explain?',
  },
  // ---- REG: healthcare
  {
    id: 'reg-health-system',
    program: 'REG',
    category: 'healthcare',
    text: 'Which problem in how healthcare is delivered concerns you most, and what could a physician do about it?',
  },
  {
    id: 'reg-health-access',
    program: 'REG',
    category: 'healthcare',
    text: 'Why do some communities have worse access to care than others, and what part could you play in that?',
  },
  {
    id: 'reg-health-patient',
    program: 'REG',
    category: 'healthcare',
    text: 'Tell me about a patient or a person you met in a clinical setting who stayed with you. Why?',
  },
  // ---- PHD: motivation
  { id: 'phd-why-mdphd', program: 'PHD', category: 'motivation', text: 'Why an MD-PhD and not just one of the two?' },
  {
    id: 'phd-why-not-phd',
    program: 'PHD',
    category: 'motivation',
    text: 'Why not a PhD alone and a research career without the clinical training?',
  },
  {
    id: 'phd-why-not-md',
    program: 'PHD',
    category: 'motivation',
    text: 'Why not an MD alone, with research on the side?',
  },
  {
    id: 'phd-years',
    program: 'PHD',
    category: 'motivation',
    text: 'The training takes eight years or more. What will keep you committed through all of it?',
  },
  // ---- PHD: research
  {
    id: 'phd-research',
    program: 'PHD',
    category: 'research',
    text: 'Describe your research to someone outside your field.',
  },
  {
    id: 'phd-hypothesis',
    program: 'PHD',
    category: 'research',
    text: 'What was the hypothesis of your main project, and how did you test it?',
  },
  {
    id: 'phd-role',
    program: 'PHD',
    category: 'research',
    text: 'Which parts of that project were your own idea or your own work, and which belonged to others?',
  },
  {
    id: 'phd-failed-experiment',
    program: 'PHD',
    category: 'research',
    text: 'Tell me about an experiment that did not work. What did you conclude, and what did you try next?',
  },
  {
    id: 'phd-next-step',
    program: 'PHD',
    category: 'research',
    text: 'If your project continued for another year, what question would you ask next and how would you design it?',
  },
  {
    id: 'phd-paper',
    program: 'PHD',
    category: 'research',
    text: 'Pick a paper you read recently. What did you find convincing, and what would you question?',
  },
  // ---- PHD: career
  {
    id: 'phd-career',
    program: 'PHD',
    category: 'career',
    text: 'What would your working week look like after training, between the clinic and the laboratory?',
  },
  {
    id: 'phd-translate',
    program: 'PHD',
    category: 'career',
    text: 'How would seeing patients change the research questions you choose to ask?',
  },
  // ---- PHD: about you
  {
    id: 'phd-mentor',
    program: 'PHD',
    category: 'teamwork',
    text: 'Describe the working relationship you want with a research mentor, and one you have had that taught you something.',
  },
  {
    id: 'phd-clinic-exposure',
    program: 'PHD',
    category: 'healthcare',
    text: 'What have you done to learn what clinical medicine is actually like, and what did it show you?',
  },
];
