import { ApiResponse } from '@uno-ultimate/shared';

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

export const SESSION_TOKEN_STORAGE_KEY = 'uno_guest_token';

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  // Fallback Bearer token from sessionStorage (secondary to HttpOnly cookie)
  try {
    const storedToken = sessionStorage.getItem(SESSION_TOKEN_STORAGE_KEY);
    if (storedToken && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${storedToken}`);
    }
  } catch {
    // SessionStorage may be restricted in some sandboxes
  }

  const url = `${API_BASE}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include', // Includes HttpOnly cookie
  });

  const data: ApiResponse<T> = await response.json();
  return data;
}
