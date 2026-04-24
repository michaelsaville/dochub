import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/crypto"
import { requireAuth } from "@/lib/auth"
import crypto from "crypto"

// ─── TOTP (RFC 6238) ──────────────────────────────────────────────────────────
function base32Decode(s: string): Buffer {
  const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
  const clean = s.toUpperCase().replace(/\s/g, "").replace(/=+$/, "")
  let bits = 0, value = 0
  const out: number[] = []
  for (const ch of clean) {
    const idx = alpha.indexOf(ch)
    if (idx === -1) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8 }
  }
  return Buffer.from(out)
}

function generateTotp(secret: string): string {
  const key = base32Decode(secret)
  const counter = BigInt(Math.floor(Date.now() / 1000 / 30))
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(counter)
  const hmac = crypto.createHmac("sha1", key).update(buf).digest()
  const offset = hmac[hmac.length - 1] & 0xf
  const code = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3]
  return String(code % 1_000_000).padStart(6, "0")
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const credential = await prisma.credential.findUnique({ where: { id } })
    if (!credential) return NextResponse.json({ error: "Not found" }, { status: 404 })

    // RBAC: TECH users only get to reveal when the credential is explicitly
    // flagged allowTechReveal. ADMIN bypasses. CLIENT never reaches staff
    // credentials (blocked at proxy level, but belt-and-suspenders).
    const role = session?.user?.role
    if (role !== "ADMIN" && !credential.allowTechReveal) {
      return NextResponse.json(
        { error: "Admin role required to reveal this credential" },
        { status: 403 },
      )
    }

    const password = decrypt(credential.encryptedPassword)

    let totp: string | null = null
    let totpCode: string | null = null
    if (credential.encryptedTotp) {
      try {
        totp = decrypt(credential.encryptedTotp)
        totpCode = generateTotp(totp)
      } catch {
        // seed decrypted but code generation failed — still return the seed
      }
    }

    let secureNotes: string | null = null
    if (credential.encryptedNotes) {
      try { secureNotes = decrypt(credential.encryptedNotes) } catch {}
    }

    return NextResponse.json({ password, totp, totpCode, secureNotes })
  } catch {
    return NextResponse.json({ error: "Failed to reveal" }, { status: 500 })
  }
}
