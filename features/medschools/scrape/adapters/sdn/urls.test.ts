import { describe, expect, it } from 'vitest';
import { SOURCES } from '../../sources';
import {
  canonicalThreadUrl,
  essayQuestionsUrl,
  forumListingUrl,
  forumRssUrl,
  summaryPageUrl,
  threadPageUrl,
} from './urls';

describe('SDN urls', () => {
  it('builds forum, thread and summary urls', () => {
    expect(forumRssUrl(1198)).toBe('/forums/1198/index.rss');
    expect(forumListingUrl(1198, 1)).toBe('/forums/1198/');
    expect(forumListingUrl(1198, 3)).toBe('/forums/1198/page-3');
    expect(threadPageUrl('a-b', 5, 1)).toBe('/threads/a-b.5/');
    expect(threadPageUrl('a-b', 5, 2)).toBe('/threads/a-b.5/page-2');
    expect(canonicalThreadUrl('a-b', 5)).toBe('https://forums.studentdoctor.net/threads/a-b.5/');
    expect(summaryPageUrl('CUCPS', 'columbia')).toBe(
      'https://www.studentdoctor.net/schools-database/medical-school/interview-feedback/summary/CUCPS/columbia',
    );
  });

  it('builds the essay-questions url on the www origin', () => {
    expect(essayQuestionsUrl('123', 'columbia-university')).toBe(
      'https://www.studentdoctor.net/schools-database/medical-school/essay-questions/123/columbia-university',
    );
    expect(essayQuestionsUrl('123', 'x').startsWith(SOURCES.SDN_WWW.origin)).toBe(true);
  });
});
