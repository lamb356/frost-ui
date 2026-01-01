/**
 * Zustand Store for FROST Multi-Sig UI
 *
 * Global state management for authentication, keys, sessions, and UI state.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  PublicKey,
  SessionId,
  SessionInfo,
  SessionRole,
  ParticipantInfo,
  SessionState,
  FrostKeyPackage,
  FrostError,
} from '@/types';

// =============================================================================
// Types
// =============================================================================

/** Authentication state */
interface AuthState {
  isAuthenticated: boolean;
  accessToken: string | null;
  tokenExpiresAt: number | null;
  pubkey: PublicKey | null;
}

/** Key management state */
interface KeysState {
  hasKeys: boolean;
  isUnlocked: boolean;
  /** Auth key pair for signing challenges */
  authKeyPair: {
    publicKey: PublicKey;
    /** Encrypted private key (only stored encrypted) */
    encryptedPrivateKey: string;
  } | null;
  /** FROST key packages (indexed by group public key) */
  frostKeyPackages: Record<string, FrostKeyPackage>;
}

/** Session history entry */
export interface SessionHistoryEntry {
  sessionId: SessionId;
  name: string;
  role: SessionRole;
  status: 'completed' | 'cancelled' | 'expired' | 'active';
  createdAt: number;
  completedAt?: number;
  participantCount: number;
  threshold: number;
  transactionHash?: string;
}

/** Active session state */
interface SessionStateSlice {
  sessionId: SessionId | null;
  role: SessionRole | null;
  session: SessionInfo | null;
  participants: ParticipantInfo[];
  status: SessionState | null;
  inviteCode: string | null;
  /** History of past sessions */
  sessionHistory: SessionHistoryEntry[];
}

/** UI state */
interface UIState {
  frostdUrl: string;
  isConnecting: boolean;
  isConnected: boolean;
  errors: FrostError[];
  /** Whether first-time setup is complete */
  setupComplete: boolean;
  /** Current theme */
  theme: 'dark' | 'light';
  /** Demo mode - uses mock client instead of real frostd */
  demoMode: boolean;
}

/** Combined store state */
interface FrostStore extends AuthState, KeysState, SessionStateSlice, UIState {
  // Auth actions
  setAuthenticated: (token: string, pubkey: PublicKey, expiresAt: number) => void;
  clearAuth: () => void;
  checkTokenExpiry: () => boolean;

  // Keys actions
  setAuthKeyPair: (publicKey: PublicKey, encryptedPrivateKey: string) => void;
  clearAuthKeyPair: () => void;
  unlockKeys: () => void;
  lockKeys: () => void;
  addFrostKeyPackage: (keyPackage: FrostKeyPackage) => void;
  removeFrostKeyPackage: (groupPublicKey: string) => void;
  getFrostKeyPackage: (groupPublicKey: string) => FrostKeyPackage | null;

  // Session actions
  setActiveSession: (session: SessionInfo, role: SessionRole, inviteCode?: string) => void;
  updateSession: (session: Partial<SessionInfo>) => void;
  updateParticipants: (participants: ParticipantInfo[]) => void;
  clearActiveSession: () => void;
  addSessionToHistory: (entry: SessionHistoryEntry) => void;
  updateSessionHistory: (sessionId: SessionId, updates: Partial<SessionHistoryEntry>) => void;
  removeSessionFromHistory: (sessionId: SessionId) => void;
  clearSessionHistory: () => void;

  // UI actions
  setFrostdUrl: (url: string) => void;
  setConnecting: (connecting: boolean) => void;
  setConnected: (connected: boolean) => void;
  addError: (error: FrostError) => void;
  clearError: (index: number) => void;
  clearAllErrors: () => void;
  completeSetup: () => void;
  setTheme: (theme: 'dark' | 'light') => void;
  setDemoMode: (enabled: boolean) => void;

  // Reset
  resetStore: () => void;
}

// =============================================================================
// Initial State
// =============================================================================

const initialAuthState: AuthState = {
  isAuthenticated: false,
  accessToken: null,
  tokenExpiresAt: null,
  pubkey: null,
};

const initialKeysState: KeysState = {
  hasKeys: false,
  isUnlocked: false,
  authKeyPair: null,
  frostKeyPackages: {},
};

const initialSessionState: SessionStateSlice = {
  sessionId: null,
  role: null,
  session: null,
  participants: [],
  status: null,
  inviteCode: null,
  sessionHistory: [],
};

const initialUIState: UIState = {
  frostdUrl: 'http://localhost:3000',
  isConnecting: false,
  isConnected: false,
  errors: [],
  setupComplete: false,
  theme: 'dark',
  demoMode: false,
};

// =============================================================================
// Store
// =============================================================================

export const useFrostStore = create<FrostStore>()(
  persist(
    (set, get) => ({
      // Initial state
      ...initialAuthState,
      ...initialKeysState,
      ...initialSessionState,
      ...initialUIState,

      // =========================================================================
      // Auth Actions
      // =========================================================================

      setAuthenticated: (token, pubkey, expiresAt) => {
        set({
          isAuthenticated: true,
          accessToken: token,
          pubkey,
          tokenExpiresAt: expiresAt,
        });
      },

      clearAuth: () => {
        set(initialAuthState);
      },

      checkTokenExpiry: () => {
        const { tokenExpiresAt, clearAuth } = get();
        if (tokenExpiresAt && Date.now() / 1000 > tokenExpiresAt) {
          clearAuth();
          return false;
        }
        return true;
      },

      // =========================================================================
      // Keys Actions
      // =========================================================================

      setAuthKeyPair: (publicKey, encryptedPrivateKey) => {
        set({
          hasKeys: true,
          authKeyPair: { publicKey, encryptedPrivateKey },
        });
      },

      clearAuthKeyPair: () => {
        set({
          hasKeys: false,
          isUnlocked: false,
          authKeyPair: null,
        });
      },

      unlockKeys: () => {
        set({ isUnlocked: true });
      },

      lockKeys: () => {
        set({ isUnlocked: false });
      },

      addFrostKeyPackage: (keyPackage) => {
        set((state) => ({
          frostKeyPackages: {
            ...state.frostKeyPackages,
            [keyPackage.groupPublicKey]: keyPackage,
          },
        }));
      },

      removeFrostKeyPackage: (groupPublicKey) => {
        set((state) => {
          const { [groupPublicKey]: _, ...rest } = state.frostKeyPackages;
          return { frostKeyPackages: rest };
        });
      },

      getFrostKeyPackage: (groupPublicKey) => {
        return get().frostKeyPackages[groupPublicKey] ?? null;
      },

      // =========================================================================
      // Session Actions
      // =========================================================================

      setActiveSession: (session, role, inviteCode) => {
        set({
          sessionId: session.sessionId,
          role,
          session,
          participants: session.participants,
          status: session.state,
          inviteCode: inviteCode ?? null,
        });
      },

      updateSession: (sessionUpdate) => {
        set((state) => ({
          session: state.session ? { ...state.session, ...sessionUpdate } : null,
          status: sessionUpdate.state ?? state.status,
          participants: sessionUpdate.participants ?? state.participants,
        }));
      },

      updateParticipants: (participants) => {
        set({ participants });
      },

      clearActiveSession: () => {
        set({
          sessionId: null,
          role: null,
          session: null,
          participants: [],
          status: null,
          inviteCode: null,
          // Keep sessionHistory
        });
      },

      addSessionToHistory: (entry) => {
        set((state) => ({
          sessionHistory: [entry, ...state.sessionHistory],
        }));
      },

      updateSessionHistory: (sessionId, updates) => {
        set((state) => ({
          sessionHistory: state.sessionHistory.map((entry) =>
            entry.sessionId === sessionId ? { ...entry, ...updates } : entry
          ),
        }));
      },

      removeSessionFromHistory: (sessionId) => {
        set((state) => ({
          sessionHistory: state.sessionHistory.filter(
            (entry) => entry.sessionId !== sessionId
          ),
        }));
      },

      clearSessionHistory: () => {
        set({ sessionHistory: [] });
      },

      // =========================================================================
      // UI Actions
      // =========================================================================

      setFrostdUrl: (url) => {
        set({ frostdUrl: url });
      },

      setConnecting: (connecting) => {
        set({ isConnecting: connecting });
      },

      setConnected: (connected) => {
        set({ isConnected: connected, isConnecting: false });
      },

      addError: (error) => {
        set((state) => ({
          errors: [...state.errors, error],
        }));
      },

      clearError: (index) => {
        set((state) => ({
          errors: state.errors.filter((_, i) => i !== index),
        }));
      },

      clearAllErrors: () => {
        set({ errors: [] });
      },

      completeSetup: () => {
        set({ setupComplete: true });
      },

      setTheme: (theme) => {
        set({ theme });
      },

      setDemoMode: (enabled) => {
        set({ demoMode: enabled });
      },

      // =========================================================================
      // Reset
      // =========================================================================

      resetStore: () => {
        set({
          ...initialAuthState,
          ...initialKeysState,
          ...initialSessionState,
          ...initialUIState,
        });
      },
    }),
    {
      name: 'frost-storage',
      storage: createJSONStorage(() => localStorage),
      // Skip hydration on server to avoid SSR mismatch errors
      skipHydration: true,
      // Only persist certain fields
      partialize: (state) => ({
        // Persist auth keys (encrypted)
        hasKeys: state.hasKeys,
        authKeyPair: state.authKeyPair,
        frostKeyPackages: state.frostKeyPackages,
        // Persist session history
        sessionHistory: state.sessionHistory,
        // Persist UI settings
        frostdUrl: state.frostdUrl,
        setupComplete: state.setupComplete,
        theme: state.theme,
        demoMode: state.demoMode,
      }),
    }
  )
);

// =============================================================================
// Selectors
// =============================================================================

/** Select auth state */
export const selectAuth = (state: FrostStore) => ({
  isAuthenticated: state.isAuthenticated,
  accessToken: state.accessToken,
  pubkey: state.pubkey,
});

/** Select keys state */
export const selectKeys = (state: FrostStore) => ({
  hasKeys: state.hasKeys,
  isUnlocked: state.isUnlocked,
  authKeyPair: state.authKeyPair,
});

/** Select active session state */
export const selectSession = (state: FrostStore) => ({
  sessionId: state.sessionId,
  role: state.role,
  session: state.session,
  participants: state.participants,
  status: state.status,
  inviteCode: state.inviteCode,
});

/** Select session history */
export const selectSessionHistory = (state: FrostStore) => ({
  sessionHistory: state.sessionHistory,
});

/** Select UI state */
export const selectUI = (state: FrostStore) => ({
  frostdUrl: state.frostdUrl,
  isConnecting: state.isConnecting,
  isConnected: state.isConnected,
  errors: state.errors,
  setupComplete: state.setupComplete,
  theme: state.theme,
  demoMode: state.demoMode,
});

/** Select connection status */
export const selectConnectionStatus = (state: FrostStore) => ({
  frostdUrl: state.frostdUrl,
  isConnecting: state.isConnecting,
  isConnected: state.isConnected,
});
