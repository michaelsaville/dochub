"use client"

import { createContext, useContext, useState, useEffect } from "react"

export type ThemeId = "pcc-dark" | "pcc-light" | "midnight" | "ocean" | "graphite"

type ThemeDef = {
  id: ThemeId
  label: string
  description: string
  previewBg: string
  previewSurface: string
  previewAccent: string
  previewText: string
  vars: Record<string, string>
}

export const THEMES: ThemeDef[] = [
  {
    id: "pcc-dark",
    label: "PCC Dark",
    description: "Default — deep navy dark",
    previewBg: "#0a0c12", previewSurface: "#10141f", previewAccent: "#3d6fff", previewText: "#e2e8f0",
    vars: {
      "--bg": "#0a0c12", "--surface": "#10141f", "--card": "#161b2a",
      "--border": "#232840", "--accent": "#3d6fff", "--accent2": "#00d4aa",
      "--danger": "#ff4d6d", "--warn": "#ffb347", "--text": "#e2e8f0", "--muted": "#64748b",
      "--color-text-muted": "#4a5568", "--color-border-primary": "#3a4060",
      "color-scheme": "dark",
    },
  },
  {
    id: "pcc-light",
    label: "PCC Light",
    description: "Clean light mode",
    previewBg: "#f8fafc", previewSurface: "#ffffff", previewAccent: "#3d6fff", previewText: "#0f172a",
    vars: {
      "--bg": "#f8fafc", "--surface": "#ffffff", "--card": "#f1f5f9",
      "--border": "#e2e8f0", "--accent": "#3d6fff", "--accent2": "#00a87a",
      "--danger": "#dc2626", "--warn": "#d97706", "--text": "#0f172a", "--muted": "#64748b",
      "--color-text-muted": "#94a3b8", "--color-border-primary": "#cbd5e1",
      "color-scheme": "light",
    },
  },
  {
    id: "midnight",
    label: "Midnight",
    description: "Pure black, purple accent",
    previewBg: "#000000", previewSurface: "#0d0d0d", previewAccent: "#7c3aed", previewText: "#f1f5f9",
    vars: {
      "--bg": "#000000", "--surface": "#0d0d0d", "--card": "#141414",
      "--border": "#1f1f1f", "--accent": "#7c3aed", "--accent2": "#10b981",
      "--danger": "#ef4444", "--warn": "#f59e0b", "--text": "#f1f5f9", "--muted": "#6b7280",
      "--color-text-muted": "#374151", "--color-border-primary": "#292929",
      "color-scheme": "dark",
    },
  },
  {
    id: "ocean",
    label: "Ocean",
    description: "Deep blue, sky accent",
    previewBg: "#051020", previewSurface: "#091830", previewAccent: "#38bdf8", previewText: "#e0f0ff",
    vars: {
      "--bg": "#051020", "--surface": "#091830", "--card": "#0e2040",
      "--border": "#163260", "--accent": "#38bdf8", "--accent2": "#34d399",
      "--danger": "#f87171", "--warn": "#fbbf24", "--text": "#e0f0ff", "--muted": "#6b9ab8",
      "--color-text-muted": "#2a4a6a", "--color-border-primary": "#1e3a5f",
      "color-scheme": "dark",
    },
  },
  {
    id: "graphite",
    label: "Graphite",
    description: "Neutral dark, violet accent",
    previewBg: "#111111", previewSurface: "#1a1a1a", previewAccent: "#a78bfa", previewText: "#d4d4d4",
    vars: {
      "--bg": "#111111", "--surface": "#1a1a1a", "--card": "#222222",
      "--border": "#2e2e2e", "--accent": "#a78bfa", "--accent2": "#4ade80",
      "--danger": "#f87171", "--warn": "#fbbf24", "--text": "#d4d4d4", "--muted": "#737373",
      "--color-text-muted": "#404040", "--color-border-primary": "#383838",
      "color-scheme": "dark",
    },
  },
]

const STORAGE_KEY = "dochub-theme"
const DEFAULT_ID: ThemeId = "pcc-dark"

function applyTheme(theme: ThemeDef) {
  const root = document.documentElement
  for (const [key, val] of Object.entries(theme.vars)) {
    if (key === "color-scheme") {
      root.style.colorScheme = val
    } else {
      root.style.setProperty(key, val)
    }
  }
}

const ThemeContext = createContext<{
  themeId: ThemeId
  setThemeId: (id: ThemeId) => void
}>({ themeId: DEFAULT_ID, setThemeId: () => {} })

export function useTheme() {
  return useContext(ThemeContext)
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeIdState] = useState<ThemeId>(DEFAULT_ID)

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as ThemeId | null
    const resolved = saved && THEMES.find(t => t.id === saved) ? saved : DEFAULT_ID
    const theme = THEMES.find(t => t.id === resolved)!
    setThemeIdState(resolved)
    applyTheme(theme)
  }, [])

  function setThemeId(id: ThemeId) {
    const theme = THEMES.find(t => t.id === id)!
    setThemeIdState(id)
    applyTheme(theme)
    localStorage.setItem(STORAGE_KEY, id)
  }

  return (
    <ThemeContext.Provider value={{ themeId, setThemeId }}>
      {children}
    </ThemeContext.Provider>
  )
}
