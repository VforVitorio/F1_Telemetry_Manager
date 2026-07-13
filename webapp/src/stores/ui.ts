import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// UI / ephemeral state (Zustand), persisted under the `f1sl.*` localStorage
// namespace per the state-model plan (A5-1). Server data lives in TanStack Query
// and selector state in the URL; this store is only for what the user *did* to
// the UI. Feature slices (chat, voice, replay) arrive with their features.
interface UiState {
  railCollapsed: boolean
  toggleRail: () => void
  setRailCollapsed: (collapsed: boolean) => void
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      railCollapsed: false,
      toggleRail: () => set((state) => ({ railCollapsed: !state.railCollapsed })),
      setRailCollapsed: (collapsed) => set({ railCollapsed: collapsed }),
    }),
    { name: 'f1sl.ui' },
  ),
)
