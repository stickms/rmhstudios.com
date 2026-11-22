import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  USER_TEXT_EXEMPT,
  USER_TEXT_RENDERERS,
  exemptReason,
  hasDirectionHandling,
  isolateText,
  rendersMemberText,
} from '@/lib/i18n/user-text';

const ROOT = path.resolve(__dirname, '../..');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue;
      walk(full, out);
    } else if (full.endsWith('.tsx') && !full.endsWith('.test.tsx')) {
      out.push(path.relative(ROOT, full).split(path.sep).join('/'));
    }
  }
  return out;
}

describe('user-text direction registry', () => {
  it('every listed renderer exists and has dir="auto" or <bdi', () => {
    for (const { file } of USER_TEXT_RENDERERS) {
      const source = readFileSync(path.join(ROOT, file), 'utf8');
      expect(hasDirectionHandling(source), `${file} lacks dir="auto" / <bdi`).toBe(true);
    }
  });

  it('lists each file once and never also exempts it', () => {
    const files = USER_TEXT_RENDERERS.map((r) => r.file);
    expect(new Set(files).size).toBe(files.length);
    for (const file of files) expect(exemptReason(file), `${file} is listed and exempt`).toBeUndefined();
  });

  it('every exempt entry carries a reason and points at something that exists', () => {
    for (const [key, reason] of Object.entries(USER_TEXT_EXEMPT)) {
      expect(reason.trim().length, key).toBeGreaterThan(5);
      const target = path.join(ROOT, key);
      expect(() => statSync(target), key).not.toThrow();
    }
  });

  it('no component renders a member-text field without being listed or exempted', () => {
    const listed = new Set(USER_TEXT_RENDERERS.map((r) => r.file));
    const offenders = walk(path.join(ROOT, 'components')).filter((file) => {
      if (listed.has(file) || exemptReason(file)) return false;
      return rendersMemberText(readFileSync(path.join(ROOT, file), 'utf8'));
    });
    expect(offenders, 'list these in USER_TEXT_RENDERERS (with dir="auto"/<bdi) or exempt them with a reason').toEqual(
      [],
    );
  });

  it('a fixture component rendering content without direction handling is caught', () => {
    const bad = `export function Row({ post }) { return <p className="t-post">{post.content}</p>; }`;
    expect(rendersMemberText(bad)).toBe(true);
    expect(hasDirectionHandling(bad)).toBe(false);
    const good = `export function Row({ post }) { return <p dir="auto">{post.content}</p>; }`;
    expect(hasDirectionHandling(good)).toBe(true);
    expect(rendersMemberText(`const x = 1;`)).toBe(false);
    // Other shapes of the same mistake.
    expect(rendersMemberText(`export const A = ({ bio }) => <p>{bio}</p>;`)).toBe(true);
    expect(rendersMemberText(`const A = () => <span>{strip(msg.content)}</span>;`)).toBe(true);
    expect(rendersMemberText(`const A = () => <textarea value={v} onChange={f} />;`)).toBe(true);
    // A prop that merely carries the field name is not a render.
    expect(rendersMemberText(`const A = () => <Input value={body} />;`)).toBe(false);
  });

  it('isolateText wraps in first-strong isolates', () => {
    expect(isolateText('@sara')).toBe('⁨@sara⁩');
  });
});
