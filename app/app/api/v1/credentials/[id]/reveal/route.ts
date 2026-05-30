import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/crypto"
import { requireApiKey } from "@/lib/api-auth"
import { logReveal } from "@/lib/reveal-log"
import crypto from "crypto"

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
  const { staffUser, apiKey, error } = await requireApiKey(req)
  if (error) return error

  // A read-only scoped key may search/read metadata but never reveal secrets.
  if (apiKey?.scope === "read") {
    return NextResponse.json({ error: "This API key is read-only (no credential reveal)" }, { status: 403 })
  }

  const { id } = await params
  const credential = await prisma.credential.findUnique({
    where: { id },
    select: {
      id: true,
      label: true,
      username: true,
      url: true,
      encryptedPassword: true,
      encryptedTotp: true,
      isRetired: true,
      allowTechReveal: true,
    },
  })

  if (!credential || credential.isRetired) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  // Same RBAC gate as the session-auth endpoint: TECH-key holders only see
  // creds that are explicitly allowTechReveal. ADMIN bypasses.
  const role = staffUser?.role
  if (role !== "ADMIN" && (role !== "TECH" || !credential.allowTechReveal)) {
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
      // seed valid but code gen failed — still return seed
    }
  }

  await logReveal({ entityId: id, actor: `${staffUser?.name ?? "API key"} (API)`, source: "api-key" })

  return NextResponse.json({
    id: credential.id,
    label: credential.label,
    username: credential.username,
    url: credential.url,
    password,
    totp,
    totpCode,
  })
}
