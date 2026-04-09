import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { verifyRegistrationResponse } from "@simplewebauthn/server"

const RP_ID = process.env.WEBAUTHN_RP_ID || "localhost"

function getOrigin(): string {
  return process.env.WEBAUTHN_ORIGIN || `https://${RP_ID}`
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth()
  if (error) return error

  const userId = (session!.user as any).id as string
  const user = await prisma.staffUser.findUnique({ where: { id: userId } })
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })
  if (!user.passkeyChallenge) return NextResponse.json({ error: "No pending challenge" }, { status: 400 })

  const body = await req.json()
  const { name: passkeyName, ...attestation } = body

  let verification
  try {
    verification = await verifyRegistrationResponse({
      response: attestation,
      expectedChallenge: user.passkeyChallenge,
      expectedOrigin: getOrigin(),
      expectedRPID: RP_ID,
      requireUserVerification: false,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: "Verification failed" }, { status: 400 })
  }

  const { credentialID, credentialPublicKey, counter } = verification.registrationInfo

  await prisma.$transaction([
    prisma.staffUserPasskey.create({
      data: {
        staffUserId: userId,
        name: passkeyName || "Passkey",
        credentialId: Buffer.from(credentialID, "base64url"),
        publicKey: Buffer.from(credentialPublicKey),
        counter: BigInt(counter),
      },
    }),
    prisma.staffUser.update({
      where: { id: userId },
      data: { passkeyChallenge: null },
    }),
  ])

  return NextResponse.json({ verified: true })
}
