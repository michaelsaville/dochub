"use client"

import { createContext, useContext } from "react"

// PCC Design System — dark only
export type Theme = "pcc"

export const themes: { id: Theme; label: string; primary: string; secondary: string }[] = [
  { id: "pcc", label: "PCC Dark", primary: "#0a0c12", secondary: "#10141f" },
]

const ThemeContext = createContext<{
  theme: Theme
  setTheme: (t: Theme) => void
}>({ theme: "pcc", setTheme: () => {} })

export function useTheme() {
  return useContext(ThemeContext)
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <ThemeContext.Provider value={{ theme: "pcc", setTheme: () => {} }}>
      {children}
    </ThemeContext.Provider>
  )
}
