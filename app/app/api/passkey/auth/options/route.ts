import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { generateAuthenticationOptions } from "@simplewebauthn/server"
import type { AuthenticatorTransportFuture } from "@simplewebauthn/types"

const RP_ID = process.env.WEBAUTHN_RP_ID || "localhost"

export async function POST() {
  const { session, error } = await requireAuth()
  if (error) return error

  const userId = (session!.user as any).id as string
  const passkeys = await prisma.staffUserPasskey.findMany({ where: { staffUserId: userId } })

  if (passkeys.length === 0) {
    return NextResponse.json({ error: "No passkeys registered" }, { status: 400 })
  }

  const allowCredentials = passkeys.map(pk => ({
    id: Buffer.from(pk.credentialId).toString("base64url"),
    transports: [] as AuthenticatorTransportFuture[],
  }))

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    allowCredentials,
    userVerification: "preferred",
  })

  // Store challenge
  await prisma.staffUser.update({
    where: { id: userId },
    data: { passkeyChallenge: options.challenge },
  })

  return NextResponse.json(options)
}
