import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { encrypt } from "@/lib/crypto"
import { requireAuth } from "@/lib/auth"
import {
  generateStrongPassword,
  graphConfigured,
  rotateUserPassword,
} from "@/lib/graph"

/**
 * Admin-only Graph-backed password rotation. Generates a strong
 * password, calls Graph PATCH /users/{upn} on the credential's linked
 * Person, persists the new encrypted copy, and writes a FieldHistory
 * row. Returns 503 when Graph isn't configured, 400 when the cred has
 * no linked person with an m365Upn.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth("ADMIN")
  if (error) return error
  if (!graphConfigured()) {
    return NextResponse.json({ error: "Microsoft Graph not configured" }, { status: 503 })
  }

  const { id } = await params
  const cred = await prisma.credential.findUnique({
    where: { id },
    include: {
      person: { select: { id: true, name: true, m365Upn: true } },
    },
  })
  if (!cred) return NextResponse.json({ error: "Credential not found" }, { status: 404 })
  if (!cred.person) {
    return NextResponse.json({ error: "Credential is not linked to a Person" }, { status: 400 })
  }
  const upn = cred.person.m365Upn?.trim()
  if (!upn) {
    return NextResponse.json({ error: "Linked Person has no m365Upn" }, { status: 400 })
  }

  const newPassword = generateStrongPassword(20)

  try {
    await rotateUserPassword({ upn, newPassword, forceChangeNextSignIn: false })
  } catch (e: any) {
    console.error("[rotate] Graph PATCH failed", e)
    return NextResponse.json({
      error: "Graph rotation failed",
      detail: e?.message?.slice(0, 300) ?? null,
    }, { status: 502 })
  }

  await prisma.credential.update({
    where: { id },
    data: {
      encryptedPassword: encrypt(newPassword),
      lastRotated: new Date(),
    },
  })
  await prisma.fieldHistory.create({
    data: {
      entityType: "credential",
      entityId: id,
      field: "password",
      oldValue: null,
      newValue: null,
      changedBy: `${session?.user?.name ?? "admin"} (Graph rotation)`,
    },
  }).catch(() => {})

  return NextResponse.json({ ok: true, lastRotated: new Date().toISOString() })
}
