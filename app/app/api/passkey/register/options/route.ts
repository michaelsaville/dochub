import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { generateRegistrationOptions } from "@simplewebauthn/server"
import type { AuthenticatorTransportFuture } from "@simplewebauthn/types"

const RP_NAME = "DocHub — PCC2K"
const RP_ID = process.env.WEBAUTHN_RP_ID || "localhost"

export async function POST() {
  const { session, error } = await requireAuth()
  if (error) return error

  const userId = (session!.user as any).id as string
  const user = await prisma.staffUser.findUnique({
    where: { id: userId },
    include: { passkeys: true },
  })
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

  // credentialID is stored as Bytes → Buffer → base64url string for the exclude list
  const excludeCredentials = user.passkeys.map(pk => ({
    id: Buffer.from(pk.credentialId).toString("base64url"),
    transports: [] as AuthenticatorTransportFuture[],
  }))

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userName: user.email,
    userDisplayName: user.name ?? user.email,
    attestationType: "none",
    excludeCredentials,
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  })

  // Store challenge
  await prisma.staffUser.update({
    where: { id: userId },
    data: { passkeyChallenge: options.challenge },
  })

  return NextResponse.json(options)
}
