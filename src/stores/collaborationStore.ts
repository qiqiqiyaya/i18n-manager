'use client';

import { create } from 'zustand';

interface LockInfo {
  keyPath: string;
  language: string;
  ip: string;
  timestamp: number;
}

interface CollaborationState {
  onlineCount: number;
  locks: Record<string, LockInfo>;
  overwrittenMessage: string | null;

  setOnlineCount: (count: number) => void;
  addLock: (lock: LockInfo) => void;
  removeLock: (language: string, keyPath: string) => void;
  isLockedByOther: (language: string, keyPath: string, myIp: string) => boolean;
  setOverwrittenMessage: (message: string | null) => void;
  reset: () => void;
}

export const useCollaborationStore = create<CollaborationState>((set, get) => ({
  onlineCount: 0,
  locks: {},
  overwrittenMessage: null,

  setOnlineCount: (onlineCount) => set({ onlineCount }),

  addLock: (lock) =>
    set((state) => ({
      locks: { ...state.locks, [`${lock.language}:${lock.keyPath}`]: lock },
    })),

  removeLock: (language, keyPath) =>
    set((state) => {
      const key = `${language}:${keyPath}`;
      const { [key]: _, ...rest } = state.locks;
      return { locks: rest };
    }),

  isLockedByOther: (language, keyPath, myIp) => {
    const lock = get().locks[`${language}:${keyPath}`];
    return !!lock && lock.ip !== myIp;
  },

  setOverwrittenMessage: (message) => set({ overwrittenMessage: message }),
  reset: () => set({ onlineCount: 0, locks: {}, overwrittenMessage: null }),
}));
