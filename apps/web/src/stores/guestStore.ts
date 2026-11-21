import { create } from 'zustand';
import { GuestSessionPublic } from '@uno-ultimate/shared';
import { guestApi } from '../services/guestApi';
import { socketManager } from '../services/socketClient';

interface GuestState {
  guest: GuestSessionPublic | null;
  sessionToken: string | null;
  isLoading: boolean;
  isResuming: boolean;
  error: string | null;

  // Actions
  createGuest: (username: string) => Promise<boolean>;
  resumeSession: () => Promise<boolean>;
  logout: () => void;
  clearError: () => void;
}

export const useGuestStore = create<GuestState>((set, _get) => ({
  guest: null,
  sessionToken: null,
  isLoading: false,
  isResuming: true,
  error: null,

  createGuest: async (username: string): Promise<boolean> => {
    set({ isLoading: true, error: null });
    try {
      const response = await guestApi.createGuest(username);
      if (response.success && response.data) {
        socketManager.updateAuthToken(response.data.sessionToken);
        set({
          guest: response.data.guest,
          sessionToken: response.data.sessionToken,
          isLoading: false,
          error: null,
        });
        return true;
      } else {
        set({
          isLoading: false,
          error: response.error?.message || 'Failed to create guest session.',
        });
        return false;
      }
    } catch {
      set({
        isLoading: false,
        error: 'Network error or server unreachable. Please try again.',
      });
      return false;
    }
  },

  resumeSession: async (): Promise<boolean> => {
    set({ isResuming: true });
    try {
      const response = await guestApi.resumeGuest();
      if (response.success && response.data) {
        socketManager.updateAuthToken(response.data.sessionToken);
        set({
          guest: response.data.guest,
          sessionToken: response.data.sessionToken,
          isResuming: false,
          error: null,
        });
        return true;
      } else {
        // If the server explicitly declared the session invalid or expired, clear it
        if (response.error?.code === 'SESSION_INVALID' || response.error?.code === 'UNAUTHORIZED') {
          set({
            guest: null,
            sessionToken: null,
            isResuming: false,
          });
          return false;
        }
        // Non-auth error -> keep existing guest in memory
        set({ isResuming: false });
        return false;
      }
    } catch {
      // Network interruption, temporary disconnection, or Render cold start:
      // Preserve existing in-memory guest and token so the player is not kicked from the match
      set({ isResuming: false });
      return false;
    }
  },

  logout: () => {
    guestApi.clearSession();
    socketManager.disconnect();
    set({
      guest: null,
      sessionToken: null,
      error: null,
    });
  },

  clearError: () => set({ error: null }),
}));
