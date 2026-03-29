import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import { authOptions } from "@/lib/auth-options"

export type UserRole = "ADMIN" | "TECH" | "CLIENT"

const roleLevel: Record<UserRole, number> = {
  ADMIN: 3,
  TECH: 2,
  CLIENT: 1,
}

/**
 * Use in API route handlers to enforce authentication and optional minimum role.
 *
 * Usage:
 *   const { session, error } = await requireAuth()
 *   if (error) return error
 *
 *   const { session, error } = await requireAuth("ADMIN")
 *   if (error) return error
 */
export async function requireAuth(minRole?: UserRole) {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    return {
      session: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    }
  }

  if (minRole) {
    const userLevel = roleLevel[session.user.role as UserRole] ?? 0
    if (userLevel < roleLevel[minRole]) {
      return {
        session: null,
        error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      }
    }
  }

  return { session, error: null }
}
