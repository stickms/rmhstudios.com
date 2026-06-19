/**
 * JSON Schemas for the multi-agent content-generation workflow. They mirror the
 * runtime shapes in ../manuscript/types.ts so generated bible/chapter JSON
 * validates before it is written to disk. (The Workflow tool's script inlines
 * equivalent schemas, since it cannot import from the repo; keep them in sync.)
 */

export const BIBLE_SCHEMA = {
  type: 'object',
  required: ['titleOptions', 'synopsis', 'characters', 'outline'],
  additionalProperties: false,
  properties: {
    titleOptions: {
      type: 'array', minItems: 3, maxItems: 5,
      items: {
        type: 'object', required: ['zh', 'en'], additionalProperties: false,
        properties: { zh: { type: 'string' }, en: { type: 'string' } },
      },
    },
    synopsis: { type: 'string', minLength: 200 },
    characters: {
      type: 'array', minItems: 4,
      items: {
        type: 'object', required: ['zh', 'en', 'role', 'source'], additionalProperties: false,
        properties: {
          zh: { type: 'string' }, en: { type: 'string' },
          role: { type: 'string' }, source: { type: 'string' },
        },
      },
    },
    outline: {
      type: 'array', minItems: 9, maxItems: 12,
      items: {
        type: 'object', required: ['n', 'zh', 'en', 'beats'], additionalProperties: false,
        properties: {
          n: { type: 'number' }, zh: { type: 'string' },
          en: { type: 'string' }, beats: { type: 'string' },
        },
      },
    },
  },
} as const;

export const CHAPTER_SCHEMA = {
  type: 'object',
  required: ['n', 'title', 'couplet', 'passages'],
  additionalProperties: false,
  properties: {
    n: { type: 'number' },
    title: {
      type: 'object', required: ['zh', 'en'], additionalProperties: false,
      properties: { zh: { type: 'string' }, en: { type: 'string' } },
    },
    couplet: {
      type: 'object', required: ['type', 'zh', 'en'], additionalProperties: false,
      properties: {
        type: { const: 'couplet' },
        zh: { type: 'array', minItems: 2, maxItems: 2, items: { type: 'string' } },
        en: { type: 'array', minItems: 2, maxItems: 2, items: { type: 'string' } },
      },
    },
    passages: {
      type: 'array', minItems: 12,
      items: {
        type: 'object', required: ['type'],
        properties: {
          type: { enum: ['heading', 'couplet', 'prose', 'verse'] },
          zh: {}, en: {},
          redComment: {
            type: 'array',
            items: {
              type: 'object', required: ['anchor', 'zh', 'en'], additionalProperties: false,
              properties: { anchor: { type: 'string' }, zh: { type: 'string' }, en: { type: 'string' } },
            },
          },
        },
      },
    },
  },
} as const;
