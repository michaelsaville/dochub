"use client"

import { SessionProvider } from "next-auth/react"
import { ThemeProvider } from "@/components/ThemeProvider"
import SyncStatusBadge from "@/components/SyncStatusBadge"
import InstallPrompt from "@/components/InstallPrompt"

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <SessionProvider>
        {children}
        <SyncStatusBadge />
        <InstallPrompt />
      </SessionProvider>
    </ThemeProvider>
  )
}
