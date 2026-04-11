import { prisma } from "./prisma"
import crypto from "crypto"

// Visibility filter for what a portal user can see in their org's vault.
// Owners see EVERYTHING in their client. Non-owners see PRIVATE only when
// they own it, plus all TEAM and MSP_SHARED items in their client.
// Items belonging to deactivated users automatically surface to owners
// (already covered: owners see everything).
export function buildVisibilityWhere(user: {
  id: string
  clientId: string
  isPortalOwner: boolean
}) {
  if (user.isPortalOwner) {
    return { clientId: user.clientId }
  }
  return {
    clientId: user.clientId,
    OR: [
      { ownedByUserId: user.id },
      { visibility: "TEAM" as const },
      { visibility: "MSP_SHARED" as const },
    ],
  }
}

export function maskItem(item: {
  id: string
  label: string
  username: string | null
  url: string | null
  notes: string | null
  encryptedTotp: string | null
  visibility: string
  ownedByUserId: string | null
  createdByStaffId: string | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: item.id,
    label: item.label,
    username: item.username,
    url: item.url,
    notes: item.notes,
    hasTotp: !!item.encryptedTotp,
    visibility: item.visibility,
    ownedByUserId: item.ownedByUserId,
    createdByStaffId: item.createdByStaffId,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }
}

export const VAULT_SESSION_MINUTES = 15

export async function getActivePortalVaultSession(portalUserId: string) {
  const s = await prisma.portalVaultSession.findUnique({ where: { portalUserId } })
  if (!s) return null
  if (s.expiresAt < new Date()) {
    await prisma.portalVaultSession.delete({ where: { portalUserId } }).catch(() => {})
    return null
  }
  return s
}

function base32Decode(s: string): Buffer {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
  s = s.toUpperCase().replace(/=+$/, "")
  let bits = 0, value = 0
  const out: number[] = []
  for (const c of s) {
    const idx = chars.indexOf(c)
    if (idx < 0) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

export function generateTotp(secret: string): string {
  const key = base32Decode(secret)
  const epoch = Math.floor(Date.now() / 1000)
  const counter = Math.floor(epoch / 30)
  const buf = Buffer.alloc(8)
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0)
  buf.writeUInt32BE(counter >>> 0, 4)
  const hmac = crypto.createHmac("sha1", key).update(buf).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const code = ((hmac[offset] & 0x7f) << 24 | hmac[offset + 1] << 16 | hmac[offset + 2] << 8 | hmac[offset + 3]) % 1000000
  return code.toString().padStart(6, "0")
}
