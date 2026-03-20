import type { SCTrack, SCPlaylist, SCUser } from './types';

const API_BASE = '/api/rochcloud';

async function apiFetch<T>(path: string, token?: string | null): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API error ${res.status}: ${body}`);
  }
  return res.json();
}

// ─── Auth ───────────────────────────────────────────────────────

export function getAuthUrl(): string {
  return `${API_BASE}/auth`;
}

export async function exchangeCode(code: string): Promise<{ accessToken: string; expiresIn: number; refreshToken: string }> {
  const res = await fetch(`${API_BASE}/callback?code=${encodeURIComponent(code)}`);
  if (!res.ok) throw new Error('Failed to exchange code');
  return res.json();
}

export async function refreshToken(token: string): Promise<{ accessToken: string; expiresIn: number; refreshToken: string }> {
  const res = await fetch(`${API_BASE}/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: token }),
  });
  if (!res.ok) throw new Error('Failed to refresh token');
  return res.json();
}

// ─── User ───────────────────────────────────────────────────────

export async function getMe(token: string): Promise<SCUser> {
  return apiFetch<SCUser>('/me', token);
}

// ─── Search ─────────────────────────────────────────────────────

export async function searchTracks(q: string, token?: string | null): Promise<SCTrack[]> {
  const data = await apiFetch<{ tracks: SCTrack[] }>(`/search?q=${encodeURIComponent(q)}&type=tracks`, token);
  return data.tracks;
}

export async function searchPlaylists(q: string, token?: string | null): Promise<SCPlaylist[]> {
  const data = await apiFetch<{ playlists: SCPlaylist[] }>(`/search?q=${encodeURIComponent(q)}&type=playlists`, token);
  return data.playlists;
}

// ─── Library ────────────────────────────────────────────────────

export async function getLikedTracks(token: string, offset = 0): Promise<{ tracks: SCTrack[]; nextOffset: number | null }> {
  return apiFetch(`/likes?offset=${offset}`, token);
}

export async function getPlaylists(token: string): Promise<SCPlaylist[]> {
  const data = await apiFetch<{ playlists: SCPlaylist[] }>('/playlists', token);
  return data.playlists;
}

export async function getPlaylistDetail(playlistId: number, token: string): Promise<SCPlaylist> {
  return apiFetch<SCPlaylist>(`/playlists/${playlistId}`, token);
}

// ─── Stream ─────────────────────────────────────────────────────

export function getStreamUrl(trackId: number, token: string): string {
  return `${API_BASE}/stream/${trackId}?token=${encodeURIComponent(token)}`;
}
