import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import type { SyncDomain, SyncProgress, View } from '../types'

interface AppState {
  writeMode: boolean
  syncRunning: boolean
  currentView: View
  selectedDomains: string[]
  availableDomains: SyncDomain[]
  currentProgress: SyncProgress
  setWriteMode: (v: boolean) => void
  setSyncRunning: (v: boolean) => void
  setCurrentView: (v: View) => void
  setSelectedDomains: (v: string[]) => void
  setAvailableDomains: (v: SyncDomain[]) => void
  setCurrentProgress: (v: SyncProgress) => void
}

const defaultProgress: SyncProgress = {
  domain: '',
  current: 0,
  total: 0,
  percent: 0,
  itemCode: '',
  known: false,
}

const AppContext = createContext<AppState | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [writeMode, setWriteMode] = useState(false)
  const [syncRunning, setSyncRunning] = useState(false)
  const [currentView, setCurrentView] = useState<View>('sync')
  const [selectedDomains, setSelectedDomains] = useState<string[]>(['products'])
  const [availableDomains, setAvailableDomains] = useState<SyncDomain[]>([])
  const [currentProgress, setCurrentProgress] = useState<SyncProgress>(defaultProgress)

  return (
    <AppContext.Provider
      value={{
        writeMode,
        syncRunning,
        currentView,
        selectedDomains,
        availableDomains,
        currentProgress,
        setWriteMode,
        setSyncRunning,
        setCurrentView,
        setSelectedDomains,
        setAvailableDomains,
        setCurrentProgress,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useAppContext(): AppState {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useAppContext debe usarse dentro de AppProvider')
  return ctx
}

export { defaultProgress }
