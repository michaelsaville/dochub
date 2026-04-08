import { prisma } from "./prisma"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import crypto from "crypto"
import type { PortalPermissions } from "./portal-types"

export type { PortalPermissions }
export { DEFAULT_PERMISSIONS } from "./portal-types"

export const PORTAL_COOKIE = "portal_session"
const EXPIRY_DAYS = 7

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex")
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, hash) => {
      if (err) reject(err)
      else resolve(`${salt}:${hash.toString("hex")}`)
    })
  })
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":")
  if (!salt || !hash) return false
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derived) => {
      if (err) reject(err)
      else resolve(crypto.timingSafeEqual(Buffer.from(derived.toString("hex")), Buffer.from(hash)))
    })
  })
}

export async function createSession(portalUserId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex")
  const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 86400 * 1000)
  await prisma.portalSession.create({ data: { token, portalUserId, expiresAt } })
  return token
}

export async function getPortalSession() {
  const cookieStore = await cookies()
  const token = cookieStore.get(PORTAL_COOKIE)?.value
  if (!token) return null

  const session = await prisma.portalSession.findUnique({
    where: { token },
    include: {
      portalUser: {
        include: { client: { select: { id: true, name: true } } },
      },
    },
  })

  if (!session) return null
  if (session.expiresAt < new Date()) {
    await prisma.portalSession.delete({ where: { token } })
    return null
  }
  if (!session.portalUser.isActive) return null

  return session.portalUser
}

export async function requirePortalAuth(): Promise<
  | { user: Awaited<ReturnType<typeof getPortalSession>> & {}; error: null }
  | { user: null; error: NextResponse }
> {
  const user = await getPortalSession()
  if (!user) {
    return { user: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }
  return { user, error: null }
}

export function getPermissions(user: { permissions: any }): PortalPermissions {
  const p = typeof user.permissions === "object" && user.permissions !== null ? user.permissions : {}
  return {
    assets: !!p.assets,
    documents: !!p.documents,
    contacts: !!p.contacts,
    locations: !!p.locations,
    licenses: !!p.licenses,
    domains: !!p.domains,
  }
}

export function sessionCookieOptions(token: string) {
  return {
    name: PORTAL_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: EXPIRY_DAYS * 86400,
    path: "/",
  }
}
