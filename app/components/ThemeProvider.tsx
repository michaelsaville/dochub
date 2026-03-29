"use client"

import { createContext, useContext, useEffect, useState } from "react"

export type Theme = "slate" | "light" | "blue" | "forest"

export const themes: { id: Theme; label: string; primary: string; secondary: string }[] = [
  { id: "slate",  label: "Slate",  primary: "#0d1117", secondary: "#161b22" },
  { id: "light",  label: "Light",  primary: "#ffffff", secondary: "#f6f8fa" },
  { id: "blue",   label: "Blue",   primary: "#0a0e1a", secondary: "#0f172a" },
  { id: "forest", label: "Forest", primary: "#0a0f0b", secondary: "#0f1a13" },
]

const ThemeContext = createContext<{
  theme: Theme
  setTheme: (t: Theme) => void
}>({ theme: "slate", setTheme: () => {} })

export function useTheme() {
  return useContext(ThemeContext)
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("slate")

  useEffect(() => {
    const saved = localStorage.getItem("dochub-theme") as Theme | null
    const valid = themes.map(t => t.id)
    if (saved && valid.includes(saved)) {
      setThemeState(saved)
      document.documentElement.setAttribute("data-theme", saved)
    }
  }, [])

  function setTheme(t: Theme) {
    setThemeState(t)
    localStorage.setItem("dochub-theme", t)
    document.documentElement.setAttribute("data-theme", t)
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
