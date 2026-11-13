import { ApiResponse, GuestAuthResponseData } from '@uno-ultimate/shared';
import { apiRequest, SESSION_TOKEN_STORAGE_KEY } from './apiClient';

export const guestApi = {
  /**
   * Creates a new guest session.
   */
  async createGuest(username: string): Promise<ApiResponse<GuestAuthResponseData>> {
    const res = await apiRequest<GuestAuthResponseData>('/api/guest', {
      method: 'POST',
      body: JSON.stringify({ username }),
    });

    if (res.success && res.data?.sessionToken) {
      try {
        sessionStorage.setItem(SESSION_TOKEN_STORAGE_KEY, res.data.sessionToken);
      } catch {
        // Ignore storage error
      }
    }

    return res;
  },

  /**
   * Resumes an existing guest session using cookie or token.
   */
  async resumeGuest(claimedGuestId?: string): Promise<ApiResponse<GuestAuthResponseData>> {
    let sessionToken: string | undefined;
    try {
      sessionToken = sessionStorage.getItem(SESSION_TOKEN_STORAGE_KEY) || undefined;
    } catch {
      // Ignore
    }

    const payload: { sessionToken?: string; guestId?: string } = {};
    if (sessionToken) payload.sessionToken = sessionToken;
    if (claimedGuestId) payload.guestId = claimedGuestId;

    const res = await apiRequest<GuestAuthResponseData>('/api/guest/resume', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (!res.success) {
      try {
        sessionStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
      } catch {
        // Ignore
      }
    }

    return res;
  },

  /**
   * Clears the guest session locally.
   */
  clearSession(): void {
    try {
      sessionStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
    } catch {
      // Ignore
    }
  },
};
