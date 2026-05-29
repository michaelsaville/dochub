import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { decrypt } from "@/lib/crypto"
import { logReveal } from "@/lib/reveal-log"
import crypto from "crypto"

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

function generateTotp(secret: string): string {
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

// GET /api/personal-vault/[id]/reveal
// Requires an active PersonalVaultSession for this user
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth()
  if (error) return error

  const userId = (session!.user as any).id as string
  const { id } = await params

  // Check vault session
  const vaultSession = await prisma.personalVaultSession.findUnique({ where: { staffUserId: userId } })
  if (!vaultSession || vaultSession.expiresAt < new Date()) {
    if (vaultSession && vaultSession.expiresAt < new Date()) {
      await prisma.personalVaultSession.delete({ where: { staffUserId: userId } }).catch(() => {})
    }
    return NextResponse.json({ error: "Vault locked. Authenticate with passkey first." }, { status: 403 })
  }

  const item = await prisma.personalCredential.findFirst({ where: { id, staffUserId: userId } })
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const password = item.encryptedPassword ? decrypt(item.encryptedPassword) : null
  let totpCode: string | null = null
  let totpSecret: string | null = null
  if (item.encryptedTotp) {
    totpSecret = decrypt(item.encryptedTotp)
    totpCode = generateTotp(totpSecret)
  }

  // Prefer encryptedNotes; fall back to legacy plaintext `notes` during the transition window.
  let secureNotes: string | null = null
  if (item.encryptedNotes) secureNotes = decrypt(item.encryptedNotes)
  else if (item.notes) secureNotes = item.notes

  await logReveal({ entityType: "personalCredential", entityId: id, actor: (session!.user as any).name, source: "personal-vault" })

  return NextResponse.json({ password, totpCode, totpSecret, secureNotes })
}
