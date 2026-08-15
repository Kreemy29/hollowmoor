import { create } from 'zustand'
import type { MinigameId } from '@/lib/types'

export interface Toast {
  id: string
  title: string
  body?: string
  tone: 'win' | 'info' | 'warn'
}

interface UiState {
  /** The panic minigame overlay — reachable from every screen. */
  cravingGame: MinigameId | null
  openCraving: (game?: MinigameId) => void
  closeCraving: () => void

  /** Support link surfacing (§9.3/§9.4). Shown once, never nagged. */
  supportOpen: boolean
  openSupport: () => void
  closeSupport: () => void

  toasts: Toast[]
  toast: (t: Omit<Toast, 'id'>) => void
  dismiss: (id: string) => void
}

export const useUi = create<UiState>((set) => ({
  cravingGame: null,
  openCraving: (game = 'crusher') => set({ cravingGame: game }),
  closeCraving: () => set({ cravingGame: null }),

  supportOpen: false,
  openSupport: () => set({ supportOpen: true }),
  closeSupport: () => set({ supportOpen: false }),

  toasts: [],
  toast: (t) =>
    set((s) => ({
      toasts: [...s.toasts, { ...t, id: Math.random().toString(36).slice(2) }].slice(-4),
    })),
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))
