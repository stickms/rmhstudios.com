/**
 * Phase 6 — Section 6.7: History Display Tests
 *
 * Verifies that both Phase 6 minigames have correct history display
 * configurations registered in the history display registry.
 */

import { describe, it, expect } from 'vitest';
import { getHistoryDisplay } from '../../../lib/rmhbox/history-display-registry';
import '../../../lib/rmhbox/history-display-registrations';

describe('History Display Configuration (§6.7)', () => {
  describe('Fact or Friction', () => {
    it('should have a registered history display config', () => {
      const config = getHistoryDisplay('fact-or-friction');
      expect(config).toBeDefined();
    });

    it('should have searchable fields', () => {
      const config = getHistoryDisplay('fact-or-friction');
      expect(config!.searchableFields).toBeDefined();
      expect(config!.searchableFields.length).toBeGreaterThan(0);
    });

    it('should have filterable fields', () => {
      const config = getHistoryDisplay('fact-or-friction');
      expect(config!.filterableFields).toBeDefined();
      expect(config!.filterableFields.length).toBeGreaterThan(0);
    });

    it('should have a getSummary function', () => {
      const config = getHistoryDisplay('fact-or-friction');
      expect(config!.getSummary).toBeDefined();
      expect(typeof config!.getSummary).toBe('function');
    });

    it('getSummary should return a string for a mock game log', () => {
      const config = getHistoryDisplay('fact-or-friction');
      const mockLog = {
        actions: [
          { type: 'question_start', payload: { questionText: 'Test?', category: 'Science' } },
          { type: 'question_start', payload: { questionText: 'Test2?', category: 'History' } },
        ],
      };
      const summary = config!.getSummary(mockLog as unknown as never);
      expect(typeof summary).toBe('string');
      expect(summary.length).toBeGreaterThan(0);
    });
  });

  describe('Undercover Editor', () => {
    it('should have a registered history display config', () => {
      const config = getHistoryDisplay('undercover-editor');
      expect(config).toBeDefined();
    });

    it('should have searchable fields including sentences and keyword', () => {
      const config = getHistoryDisplay('undercover-editor');
      expect(config!.searchableFields).toBeDefined();

      const keys = config!.searchableFields.map((f) => f.key);
      expect(keys).toContain('sentences');
      expect(keys).toContain('keyword');
    });

    it('should have filterable fields including role, editorCaught, keywordInStory', () => {
      const config = getHistoryDisplay('undercover-editor');
      expect(config!.filterableFields).toBeDefined();

      const keys = config!.filterableFields.map((f) => f.key);
      expect(keys).toContain('role');
      expect(keys).toContain('editorCaught');
      expect(keys).toContain('keywordInStory');
    });

    it('getSummary should return descriptive string for a mock game log', () => {
      const config = getHistoryDisplay('undercover-editor');
      const mockLog = {
        actions: [
          {
            type: 'reveal',
            payload: {
              storyReveals: [
                { storyId: 'story1', keyword: 'shadow', keywordInStory: true },
                { storyId: 'story2', keyword: 'light', keywordInStory: false },
              ],
            },
          },
        ],
      };
      const summary = config!.getSummary(mockLog as unknown as never);
      expect(typeof summary).toBe('string');
      expect(summary).toContain('2 parallel stories');
    });
  });
});
