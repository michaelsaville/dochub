import { getServerSession } from "next-auth"
import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { authOptions } from "@/lib/auth-options"
import { prisma } from "@/lib/prisma"
import { isStaffIpAllowed } from "@/lib/ip-allow"

export type UserRole = "ADMIN" | "TECH" | "CLIENT"

const roleLevel: Record<UserRole, number> = {
  ADMIN: 3,
  TECH: 2,
  CLIENT: 1,
}

/**
 * Cache the global IP-allowlist flag for 30s to avoid a DB roundtrip on
 * every authed request. When the feature is off (default) this is a
 * single-key lookup; when on, enforcement is still live because the
 * per-user list is queried fresh inside isStaffIpAllowed.
 */
let _ipFlagCache: { value: boolean; expiresAt: number } | null = null
async function ipAllowlistEnforced(): Promise<boolean> {
  const now = Date.now()
  if (_ipFlagCache && _ipFlagCache.expiresAt > now) return _ipFlagCache.value
  const row = await prisma.appSetting.findUnique({
    where: { key: "security:staff_ip_allowlist_enabled" },
    select: { value: true },
  }).catch(() => null)
  const enforced = row?.value === "true"
  _ipFlagCache = { value: enforced, expiresAt: now + 30_000 }
  return enforced
}

/**
 * The JWT freezes role at sign-in (up to 30 days), so a demote or a disable
 * wouldn't take effect. Re-check the live StaffUser (cached 30s) so a deleted
 * or deactivated account is rejected and the current role wins over the token.
 * Fails OPEN on DB error — never lock everyone out over a transient outage.
 */
type LiveStaff = { role: UserRole; isActive: boolean }
const _staffCache = new Map<string, { value: LiveStaff | null; error: boolean; expiresAt: number }>()
async function getLiveStaff(id: string): Promise<{ value: LiveStaff | null; error: boolean }> {
  const now = Date.now()
  const c = _staffCache.get(id)
  if (c && c.expiresAt > now) return { value: c.value, error: c.error }
  try {
    const u = await prisma.staffUser.findUnique({ where: { id }, select: { role: true, isActive: true } })
    const value = u ? { role: u.role as UserRole, isActive: u.isActive } : null
    _staffCache.set(id, { value, error: false, expiresAt: now + 30_000 })
    return { value, error: false }
  } catch {
    _staffCache.set(id, { value: null, error: true, expiresAt: now + 5_000 })
    return { value: null, error: true }
  }
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

  // Live re-check: reject deleted/deactivated accounts; current role wins over
  // the (up to 30-day) stale JWT. Fail-open on DB error.
  const uid = (session.user as { id?: string }).id
  if (uid) {
    const live = await getLiveStaff(uid)
    if (!live.error) {
      if (!live.value || !live.value.isActive) {
        return {
          session: null,
          error: NextResponse.json({ error: "Account disabled" }, { status: 401 }),
        }
      }
      session.user.role = live.value.role
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

  // IP allowlist — gated on the global AppSetting. No-op when disabled
  // (default), so deploy can't lock anyone out. When enabled, per-user
  // CIDR list is enforced; Tailscale CGNAT always allowed.
  if (await ipAllowlistEnforced()) {
    const user = await prisma.staffUser.findUnique({
      where: { id: (session.user as any).id },
      select: { ipAllowlist: true },
    }).catch(() => null)
    const hdrs = await headers()
    const check = await isStaffIpAllowed(hdrs, user)
    if (!check.allowed) {
      return {
        session: null,
        error: NextResponse.json(
          { error: "IP not allowed", reason: check.reason },
          { status: 403 },
        ),
      }
    }
  }

  return { session, error: null }
}
