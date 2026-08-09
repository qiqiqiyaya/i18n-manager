'use client';

import { create } from 'zustand';

interface CollaborationState {
  onlineCount: number;
  overwrittenMessage: string | null;

  setOnlineCount: (count: number) => void;
  setOverwrittenMessage: (message: string | null) => void;
  reset: () => void;
}

export const useCollaborationStore = create<CollaborationState>((set) => ({
  onlineCount: 0,
  overwrittenMessage: null,

  setOnlineCount: (onlineCount) => set({ onlineCount }),

  setOverwrittenMessage: (message) => set({ overwrittenMessage: message }),
  reset: () => set({ onlineCount: 0, overwrittenMessage: null }),
}));
