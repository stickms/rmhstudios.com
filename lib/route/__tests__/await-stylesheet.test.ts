// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { awaitStylesheet } from '../await-stylesheet';

afterEach(() => {
  document.head.innerHTML = '';
});

describe('awaitStylesheet', () => {
  it('waits for the link to load, adding it when the document has none', async () => {
    let settled = false;
    const p = awaitStylesheet('/x.css').then(() => {
      settled = true;
    });
    const link = document.head.querySelector<HTMLLinkElement>('link[rel="stylesheet"][href="/x.css"]');
    expect(link).not.toBeNull();
    await Promise.resolve();
    expect(settled).toBe(false);
    link!.dispatchEvent(new Event('load'));
    await p;
    expect(settled).toBe(true);
  });

  it('reuses an existing link rather than adding a second', async () => {
    const existing = document.createElement('link');
    existing.rel = 'stylesheet';
    existing.setAttribute('href', '/y.css');
    document.head.appendChild(existing);
    const p = awaitStylesheet('/y.css');
    expect(document.head.querySelectorAll('link[href="/y.css"]').length).toBe(1);
    existing.dispatchEvent(new Event('error'));
    await p;
  });
});
