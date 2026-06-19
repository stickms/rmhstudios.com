import type { Chapter, Passage, CoupletPassage } from './types';

function isStr(x: unknown): x is string { return typeof x === 'string'; }
function strArr(x: unknown): x is string[] { return Array.isArray(x) && x.every(isStr); }

function validatePassage(p: any, i: number | string): Passage {
  if (!p || typeof p !== 'object') throw new Error(`passage[${i}] not an object`);
  switch (p.type) {
    case 'heading':
      if (!isStr(p.zh) || !isStr(p.en)) throw new Error(`passage[${i}] heading needs zh/en strings`);
      return p;
    case 'couplet':
      if (!strArr(p.zh) || p.zh.length !== 2 || !strArr(p.en) || p.en.length !== 2)
        throw new Error(`passage[${i}] couplet needs 2 zh + 2 en lines`);
      return p;
    case 'prose':
      if (!isStr(p.zh) || !isStr(p.en)) throw new Error(`passage[${i}] prose needs zh/en strings`);
      return p;
    case 'verse':
      if (!strArr(p.zh) || !strArr(p.en)) throw new Error(`passage[${i}] verse needs zh/en line arrays`);
      if (p.zh.length !== p.en.length) throw new Error(`passage[${i}] verse line count mismatch`);
      return p;
    default:
      throw new Error(`passage[${i}] unknown type ${JSON.stringify(p.type)}`);
  }
}

export function validateChapter(c: unknown): Chapter {
  const ch = c as any;
  if (!ch || typeof ch !== 'object') throw new Error('chapter not an object');
  if (typeof ch.n !== 'number') throw new Error('chapter.n must be a number');
  if (!ch.title || !isStr(ch.title.zh) || !isStr(ch.title.en)) throw new Error('chapter.title needs zh/en');
  if (!ch.couplet || ch.couplet.type !== 'couplet') throw new Error('chapter.couplet missing');
  validatePassage(ch.couplet as CoupletPassage, 'couplet');
  if (!Array.isArray(ch.passages)) throw new Error('chapter.passages must be an array');
  ch.passages.forEach((p: unknown, i: number) => validatePassage(p, i));
  return ch as Chapter;
}
