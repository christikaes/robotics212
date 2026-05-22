import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'

interface SettingsState {
  showOverlays: boolean
  setShowOverlays: (v: boolean) => void
}

const SettingsContext = createContext<SettingsState | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [showOverlays, setShowOverlays] = useState(true)
  return (
    <SettingsContext.Provider value={{ showOverlays, setShowOverlays }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings(): SettingsState {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider')
  return ctx
}
