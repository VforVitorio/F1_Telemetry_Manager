import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// UI / ephemeral state (Zustand), persisted under the `f1sl.*` localStorage
// namespace per the state-model plan (A5-1). Server data lives in TanStack Query
// and selector state in the URL; this store is only for what the user *did* to
// the UI. Feature slices (chat, voice, replay) arrive with their features.
// Two-state theme (no 'system'): both sibling brand surfaces (landing, docs) are
// dark-only, so dark is the identity default and a binary toggle keeps the CSS
// single-sourced on the `data-theme` attribute. If 'system' is ever wanted it
// resolves here, not in the CSS.
export type Theme = 'dark' | 'light'

interface UiState {
  railCollapsed: boolean
  toggleRail: () => void
  setRailCollapsed: (collapsed: boolean) => void
  theme: Theme
  toggleTheme: () => void
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      railCollapsed: false,
      toggleRail: () => set((state) => ({ railCollapsed: !state.railCollapsed })),
      setRailCollapsed: (collapsed) => set({ railCollapsed: collapsed }),
      theme: 'dark',
      toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),
    }),
    { name: 'f1sl.ui' },
  ),
)
