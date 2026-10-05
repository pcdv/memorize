import { createContext, useContext } from 'react'
import { DEFAULT_SETTINGS, type Settings } from './lib/db'

export const SettingsContext = createContext<Settings>(DEFAULT_SETTINGS)

export const useSettings = () => useContext(SettingsContext)
