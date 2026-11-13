import { create } from 'zustand';
import { GuestSessionPublic } from '@uno-ultimate/shared';
import { guestApi } from '../services/guestApi';

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
        set({
          guest: response.data.guest,
          sessionToken: response.data.sessionToken,
          isResuming: false,
          error: null,
        });
        return true;
      } else {
        set({
          guest: null,
          sessionToken: null,
          isResuming: false,
        });
        return false;
      }
    } catch {
      set({
        guest: null,
        sessionToken: null,
        isResuming: false,
      });
      return false;
    }
  },

  logout: () => {
    guestApi.clearSession();
    set({
      guest: null,
      sessionToken: null,
      error: null,
    });
  },

  clearError: () => set({ error: null }),
}));
