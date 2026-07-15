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

// Drag-to-resize bounds for the expanded rail (Rail.tsx owns the collapsed
// width, which is fixed and never resizable). Exported so Rail.tsx can reuse
// the exact same numbers for its `aria-valuemin`/`aria-valuemax` instead of
// duplicating the bounds and risking drift between the clamp and the a11y
// attributes that describe it.
export const RAIL_WIDTH_MIN = 200
export const RAIL_WIDTH_MAX = 360
const RAIL_WIDTH_DEFAULT = 232

function clampRailWidth(width: number): number {
  return Math.min(RAIL_WIDTH_MAX, Math.max(RAIL_WIDTH_MIN, width))
}

interface UiState {
  railCollapsed: boolean
  toggleRail: () => void
  setRailCollapsed: (collapsed: boolean) => void
  railWidth: number
  setRailWidth: (width: number) => void
  theme: Theme
  toggleTheme: () => void
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      railCollapsed: false,
      toggleRail: () => set((state) => ({ railCollapsed: !state.railCollapsed })),
      setRailCollapsed: (collapsed) => set({ railCollapsed: collapsed }),
      railWidth: RAIL_WIDTH_DEFAULT,
      setRailWidth: (width) => set({ railWidth: clampRailWidth(width) }),
      theme: 'dark',
      toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),
    }),
    { name: 'f1sl.ui' },
  ),
)
