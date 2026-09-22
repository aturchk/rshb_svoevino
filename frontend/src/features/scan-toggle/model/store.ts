import { create } from 'zustand'

interface ScanToggleState {
  collapsed: boolean
  toggle: () => void
  setCollapsed: (value: boolean) => void
}

/**
 * Свёрнутость сканера живёт в сторе, а не в состоянии страницы: по ТЗ она
 * обязана переживать переход между разделами «История» и «Каталог».
 */
export const useScanToggleStore = create<ScanToggleState>((set) => ({
  collapsed: false,
  toggle: () => set((state) => ({ collapsed: !state.collapsed })),
  setCollapsed: (value) => set({ collapsed: value }),
}))
