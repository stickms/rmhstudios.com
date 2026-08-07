import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LOBBY_LINK_PARAM,
  lobbyLink,
  lobbyPathLink,
  readLobbyCodeFromSearch,
  sanitizeLobbyCode,
} from '@/lib/lobby-link';

/** The suite runs in `node`, so a page is something we hand it deliberately. */
function onPage(origin: string, pathname: string) {
  vi.stubGlobal('window', { location: { origin, pathname, search: '' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sanitizeLobbyCode', () => {
  it('accepts the code shapes the games actually mint', () => {
    expect(sanitizeLobbyCode('AB12CD')).toBe('AB12CD'); // most games
    expect(sanitizeLobbyCode('XKCD5')).toBe('XKCD5'); // synapse storm, 5
    expect(sanitizeLobbyCode('ndw-m3x8q2')).toBe('ndw-m3x8q2'); // neon driftway
  });

  it('never re-cases a code', () => {
    // Uppercasing here would break the one game whose ids are lowercase, and
    // every game already normalises its own input.
    expect(sanitizeLobbyCode('ndw-abc123')).toBe('ndw-abc123');
    expect(sanitizeLobbyCode(' ab12cd ')).toBe('ab12cd');
  });

  it('rejects anything that could not join a lobby', () => {
    expect(sanitizeLobbyCode('')).toBeNull();
    expect(sanitizeLobbyCode('AB')).toBeNull();
    expect(sanitizeLobbyCode('AB 12')).toBeNull();
    expect(sanitizeLobbyCode('<script>')).toBeNull();
    expect(sanitizeLobbyCode('-leading')).toBeNull();
    expect(sanitizeLobbyCode('A'.repeat(33))).toBeNull();
    expect(sanitizeLobbyCode(undefined)).toBeNull();
    expect(sanitizeLobbyCode(42)).toBeNull();
  });
});

describe('lobbyLink', () => {
  it('hangs the code off the page the lobby lives on', () => {
    onPage('https://rmhstudios.com', '/laundry-sort');
    expect(lobbyLink('AB12CD')).toBe('https://rmhstudios.com/laundry-sort?lobby=AB12CD');
  });

  it('takes an explicit path for a lobby rendered somewhere else', () => {
    onPage('https://rmhstudios.com', '/kowloon-knockout/');
    expect(lobbyLink('AB12CD', '/kowloon-knockout')).toBe(
      'https://rmhstudios.com/kowloon-knockout?lobby=AB12CD',
    );
  });

  it('keeps the rest of the query out of it', () => {
    onPage('http://localhost:7005', '/gabriels-horn');
    const url = new URL(lobbyLink('QQ99'));
    expect(url.origin).toBe('http://localhost:7005');
    expect(url.searchParams.get(LOBBY_LINK_PARAM)).toBe('QQ99');
  });

  it('is empty during SSR rather than half a URL', () => {
    vi.stubGlobal('window', undefined);
    expect(lobbyLink('AB12CD')).toBe('');
    expect(lobbyPathLink('/rmhbox/AB12CD')).toBe('');
  });
});

describe('lobbyPathLink', () => {
  it('absolutises a lobby that is already its own route', () => {
    onPage('https://rmhstudios.com', '/rmhbox');
    expect(lobbyPathLink('/rmhbox/AB12CD')).toBe('https://rmhstudios.com/rmhbox/AB12CD');
  });
});

describe('readLobbyCodeFromSearch', () => {
  it('reads the param a router-less lobby cannot ask for', () => {
    expect(readLobbyCodeFromSearch('?lobby=AB12CD')).toBe('AB12CD');
    expect(readLobbyCodeFromSearch('?view=x&lobby=AB12CD&y=1')).toBe('AB12CD');
  });

  it('is null when there is nothing joinable in it', () => {
    expect(readLobbyCodeFromSearch('')).toBeNull();
    expect(readLobbyCodeFromSearch('?view=x')).toBeNull();
    expect(readLobbyCodeFromSearch('?lobby=')).toBeNull();
    expect(readLobbyCodeFromSearch('?lobby=%3Cscript%3E')).toBeNull();
  });
});
