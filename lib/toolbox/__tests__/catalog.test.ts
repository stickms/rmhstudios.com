import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TOOL_CATEGORIES, TOOLS, matchesToolQuery, toolBySlug } from '@/lib/toolbox/catalog';
import { STATIC_ROUTES } from '@/lib/sitemap';

const ROUTES = path.resolve(import.meta.dirname, '../../../app/routes/_site/tools');

describe('Toolbox catalog', () => {
  it('has twenty tools with unique, URL-safe slugs in known categories', () => {
    expect(TOOLS).toHaveLength(20);
    const slugs = TOOLS.map((tool) => tool.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const tool of TOOLS) {
      expect(tool.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(TOOL_CATEGORIES).toContain(tool.category);
    }
  });

  it('gives every tool a route file, and has no route without a tool', () => {
    for (const tool of TOOLS) {
      expect(existsSync(path.join(ROUTES, `${tool.slug}.tsx`)), tool.slug).toBe(true);
    }
    const files = readdirSync(ROUTES)
      .filter((file) => file !== 'index.tsx')
      .map((file) => file.replace(/\.tsx$/, ''));
    expect(files.sort()).toEqual(TOOLS.map((tool) => tool.slug).sort());
  });

  it('lists the hub and every tool in the sitemap', () => {
    const locs = new Set(STATIC_ROUTES.map((entry) => entry.loc));
    expect(locs.has('/tools')).toBe(true);
    for (const tool of TOOLS) expect(locs.has(`/tools/${tool.slug}`), tool.slug).toBe(true);
  });

  it('looks tools up by slug', () => {
    expect(toolBySlug('contrast')?.category).toBe('developer');
    expect(toolBySlug('nope')).toBeUndefined();
  });

  it('matches every term of a filter, case-insensitively', () => {
    expect(matchesToolQuery('Contrast checker wcag', 'WCAG')).toBe(true);
    expect(matchesToolQuery('Contrast checker wcag', 'contrast  wcag')).toBe(true);
    expect(matchesToolQuery('Contrast checker wcag', 'contrast json')).toBe(false);
    expect(matchesToolQuery('anything', '   ')).toBe(true);
  });
});
