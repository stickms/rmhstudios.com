import { describe, expect, it } from 'vitest';
import { redactResumePii } from './redact';

describe('redactResumePii', () => {
  it('removes contact PII and a likely contact-header name', () => {
    const result = redactResumePii(`Alex Example\nalex@example.com | (212) 555-0199\nhttps://linkedin.com/in/alex-example\n123 Main Street\n\nEXPERIENCE\nBuilt payment systems.`);
    expect(result.text).not.toContain('Alex Example');
    expect(result.text).not.toContain('alex@example.com');
    expect(result.text).not.toContain('212');
    expect(result.text).not.toContain('linkedin.com');
    expect(result.text).not.toContain('123 Main');
    expect(result.text).toContain('[NAME]');
    expect(result.counts).toEqual({ email: 1, phone: 1, url: 1, address: 1, name: 1 });
  });

  it('does not mistake an ordinary section heading for a name', () => {
    const result = redactResumePii('Professional Experience\nBuilt reliable services.');
    expect(result.text).toContain('Professional Experience');
    expect(result.counts.name).toBe(0);
  });

  it('removes middle initials and names sharing a line with contact details', () => {
    const result = redactResumePii('Jane Q. Doe | jane.doe@example.com | 212-555-0123\nEXPERIENCE');
    expect(result.text).not.toContain('Jane Q. Doe');
    expect(result.text).not.toContain('jane.doe@example.com');
    expect(result.text).toContain('[NAME]');
    expect(result.counts.name).toBe(1);
  });
});
