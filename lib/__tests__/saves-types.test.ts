import { describe, it, expect } from 'vitest';
import {
  saveEntitySchema,
  folderCreateSchema,
  folderUpdateSchema,
  SAVE_ENTITY_TYPES,
  MAX_FOLDER_NAME,
} from '@/lib/saves/types';

describe('saveEntitySchema', () => {
  it('accepts known entity types', () => {
    for (const entityType of SAVE_ENTITY_TYPES) {
      expect(saveEntitySchema.safeParse({ entityType, entityId: 'abc' }).success).toBe(true);
    }
  });

  it('accepts an optional folderId (incl. null)', () => {
    expect(saveEntitySchema.safeParse({ entityType: 'rmhark', entityId: 'x', folderId: 'f1' }).success).toBe(true);
    expect(saveEntitySchema.safeParse({ entityType: 'rmhark', entityId: 'x', folderId: null }).success).toBe(true);
  });

  it('rejects unknown types and empty ids', () => {
    expect(saveEntitySchema.safeParse({ entityType: 'nope', entityId: 'x' }).success).toBe(false);
    expect(saveEntitySchema.safeParse({ entityType: 'rmhark', entityId: '' }).success).toBe(false);
  });
});

describe('folder schemas', () => {
  it('validates folder names', () => {
    expect(folderCreateSchema.safeParse({ name: 'Read later' }).success).toBe(true);
    expect(folderCreateSchema.safeParse({ name: '   ' }).success).toBe(false);
    expect(folderCreateSchema.safeParse({ name: 'a'.repeat(MAX_FOLDER_NAME + 1) }).success).toBe(false);
  });

  it('validates folder updates', () => {
    expect(folderUpdateSchema.safeParse({ sortOrder: 3 }).success).toBe(true);
    expect(folderUpdateSchema.safeParse({ name: 'Bangers' }).success).toBe(true);
    expect(folderUpdateSchema.safeParse({ sortOrder: -1 }).success).toBe(false);
  });
});
