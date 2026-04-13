"use client"

import { createContext, useContext } from "react"

export type PortalUser = {
  id: string
  name: string
  email: string
  client: { id: string; name: string }
  isPortalOwner: boolean
  permissions: Record<string, boolean>
}

export const PortalCtx = createContext<PortalUser | null>(null)
export function usePortalUser() { return useContext(PortalCtx) }
