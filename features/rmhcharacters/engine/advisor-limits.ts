/** Size limits for the advisor request, shared by the client (to trim) and the schema (to enforce). */
export const ADVISOR_LIMITS = {
  question: 1_000,
  sheet: 12_000,
  turns: 6,
  turn: 4_000,
  recommendations: 8,
} as const;
