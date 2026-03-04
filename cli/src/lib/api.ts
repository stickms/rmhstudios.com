import type { ApiError } from '../types.js';

const API_BASE = process.env.RMHCODE_API_URL || 'https://rmhstudios.com';

interface RequestOptions {
  method?: string;
  token?: string;
  body?: Record<string, unknown>;
  params?: Record<string, string>;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', token, body, params } = options;

  let url = `${API_BASE}${path}`;
  if (params) {
    const search = new URLSearchParams(params);
    url += `?${search.toString()}`;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['X-RMHCode-Token'] = token;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();

  if (!res.ok) {
    const err = data as ApiError;
    throw new Error(err.error || `API error: ${res.status}`);
  }

  return data as T;
}

export { API_BASE };
