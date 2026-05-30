import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { verifyAuthenticationResponse } from "@simplewebauthn/server"

const RP_ID = process.env.WEBAUTHN_RP_ID || "localhost"

function getOrigin(): string {
  return process.env.WEBAUTHN_ORIGIN || `https://${RP_ID}`
}

const VAULT_SESSION_MINUTES = 15

export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth()
  if (error) return error

  const userId = (session!.user as any).id as string
  const user = await prisma.staffUser.findUnique({ where: { id: userId } })
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })
  if (!user.passkeyChallenge) return NextResponse.json({ error: "No pending challenge" }, { status: 400 })

  const body = await req.json()
  const credentialIdB64 = body.id as string

  const credentialIdBuf = Buffer.from(credentialIdB64, "base64url")
  const passkey = await prisma.staffUserPasskey.findFirst({
    where: { credentialId: credentialIdBuf, staffUserId: userId },
  })
  if (!passkey) return NextResponse.json({ error: "Unknown passkey" }, { status: 400 })

  let verification
  try {
    verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge: user.passkeyChallenge,
      expectedOrigin: getOrigin(),
      expectedRPID: RP_ID,
      // Require a biometric/PIN gesture — a passkey on an unlocked/borrowed
      // device shouldn't silently satisfy the vault/auth check.
      requireUserVerification: true,
      authenticator: {
        credentialID: Buffer.from(passkey.credentialId).toString("base64url"),
        credentialPublicKey: new Uint8Array(passkey.publicKey),
        counter: Number(passkey.counter),
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }

  if (!verification.verified) {
    return NextResponse.json({ error: "Authentication failed" }, { status: 400 })
  }

  const expiresAt = new Date(Date.now() + VAULT_SESSION_MINUTES * 60 * 1000)

  await prisma.$transaction([
    prisma.staffUserPasskey.update({
      where: { id: passkey.id },
      data: {
        counter: BigInt(verification.authenticationInfo.newCounter),
        lastUsedAt: new Date(),
      },
    }),
    prisma.staffUser.update({
      where: { id: userId },
      data: { passkeyChallenge: null },
    }),
    prisma.personalVaultSession.upsert({
      where: { staffUserId: userId },
      update: { expiresAt },
      create: { staffUserId: userId, expiresAt },
    }),
  ])

  return NextResponse.json({ verified: true, expiresAt })
}
