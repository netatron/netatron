import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthProfile } from "@/types/api";
import { setAuthToken } from "@/lib/api";

interface AuthState {
  user: AuthProfile | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: AuthProfile | null, token: string | null) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false, // Start with false - will be true only when verifying token
      setUser: (user: AuthProfile | null, token: string | null) => {
        setAuthToken(token);
        set({
          user,
          token,
          isAuthenticated: !!user && !!token,
          isLoading: false,
        });
      },
      logout: () => {
        setAuthToken(null);
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          isLoading: false,
        });
      },
      setLoading: (loading: boolean) => set({ isLoading: loading }),
    }),
    {
      name: "netatron-auth",
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        // After rehydration from localStorage, set loading to false
        // and sync token to api.ts
        if (state) {
          state.isLoading = false;
          // Sync token to api.ts after rehydration
          if (state.token) {
            setAuthToken(state.token);
          }
        }
      },
    }
  )
);
