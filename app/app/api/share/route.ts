import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import crypto from "crypto"

export async function POST(req: Request) {
  const { session, error } = await requireAuth()
  if (error) return error

  const { resourceType, resourceId, expiresInHours, maxViews, passphrase } = await req.json()

  if (!["credential", "document"].includes(resourceType)) {
    return NextResponse.json({ error: "Invalid resource type" }, { status: 400 })
  }

  // Verify resource exists
  if (resourceType === "credential") {
    const cred = await prisma.credential.findUnique({ where: { id: resourceId } })
    if (!cred) return NextResponse.json({ error: "Credential not found" }, { status: 404 })
    // RBAC: a share link consumes the credential via the public endpoint, so
    // creating one must honour the same gate as a direct reveal — otherwise a
    // TECH could mint a public link for a credential they can't reveal.
    if (session?.user?.role !== "ADMIN" && !cred.allowTechReveal) {
      return NextResponse.json(
        { error: "Admin role required to share this credential" },
        { status: 403 },
      )
    }
  } else {
    const doc = await prisma.clientDocument.findUnique({ where: { id: resourceId } })
    if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 })
  }

  const hours = Math.min(Math.max(expiresInHours || 24, 1), 168) // 1h to 7 days
  const expiresAt = new Date(Date.now() + hours * 3600000)

  let passphraseHash: string | null = null
  if (passphrase?.trim()) {
    const salt = crypto.randomBytes(16).toString("hex")
    const hash = crypto.scryptSync(passphrase.trim(), salt, 64).toString("hex")
    passphraseHash = `${salt}:${hash}`
  }

  const link = await prisma.secureShareLink.create({
    data: {
      resourceType,
      resourceId,
      passphrase: passphraseHash,
      expiresAt,
      maxViews: maxViews || 1,
      createdBy: session?.user?.name ?? null,
    },
  })

  const url = `${process.env.NEXTAUTH_URL || "https://dochub.pcc2k.com"}/shared/${link.id}`
  return NextResponse.json({ id: link.id, url, expiresAt, maxViews: link.maxViews })
}
