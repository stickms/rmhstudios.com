/**
 * The twelve fields RMH Research publishes in, in display order, and the four
 * divisions they are grouped under. English names live here because the
 * archive search and the citation formats read them; the pages translate their
 * own labels (`components/rmh-research/labels.ts`).
 */
import type { DivisionId, Field, FieldId } from './types';

export const DIVISIONS: readonly DivisionId[] = ['formal', 'physical', 'life', 'human'];

export const FIELDS: readonly Field[] = [
  { id: 'mathematics', code: 'MATH', name: 'Mathematics', division: 'formal' },
  { id: 'computer-science', code: 'CS', name: 'Computer Science', division: 'formal' },
  { id: 'engineering', code: 'ENG', name: 'Engineering & Materials', division: 'formal' },
  { id: 'physics', code: 'PHYS', name: 'Physics', division: 'physical' },
  { id: 'chemistry', code: 'CHEM', name: 'Chemistry', division: 'physical' },
  { id: 'astronomy', code: 'ASTRO', name: 'Astronomy & Space', division: 'physical' },
  { id: 'earth', code: 'EARTH', name: 'Earth & Climate', division: 'physical' },
  { id: 'biology', code: 'BIO', name: 'Biology', division: 'life' },
  { id: 'medicine', code: 'MED', name: 'Medicine & Health', division: 'life' },
  { id: 'neuroscience', code: 'NEURO', name: 'Neuroscience', division: 'life' },
  { id: 'psychology', code: 'PSY', name: 'Psychology & Behaviour', division: 'human' },
  { id: 'social-sciences', code: 'SOC', name: 'Economics & Social Science', division: 'human' },
];

const BY_ID = new Map<string, Field>(FIELDS.map((f) => [f.id, f]));

export function isFieldId(value: unknown): value is FieldId {
  return typeof value === 'string' && BY_ID.has(value);
}

export function getField(id: FieldId): Field {
  const field = BY_ID.get(id);
  if (!field) throw new Error(`Unknown field: ${id}`);
  return field;
}

export function fieldsInDivision(division: DivisionId): Field[] {
  return FIELDS.filter((f) => f.division === division);
}
