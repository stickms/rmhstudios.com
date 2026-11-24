import { z } from 'zod';
import { GENERAL_CATEGORIES, GENERAL_PROGRAMS } from './general-questions';

/** The shape of the general-question set. Server and tests only: the page bundle imports the data, not this. */
export const generalQuestionSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    .max(48),
  program: z.enum(GENERAL_PROGRAMS),
  category: z.enum(GENERAL_CATEGORIES),
  text: z.string().trim().min(10).max(300),
});

export const generalQuestionsSchema = z.array(generalQuestionSchema).min(25).max(40);
