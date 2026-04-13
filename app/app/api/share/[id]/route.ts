import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/crypto"
import crypto from "crypto"

/** Public endpoint — no auth required. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))

  const link = await prisma.secureShareLink.findUnique({ where: { id } })
  if (!link || link.expiresAt < new Date() || link.viewCount >= link.maxViews) {
    return NextResponse.json({ error: "Link expired or not found" }, { status: 404 })
  }

  // Verify passphrase if set
  if (link.passphrase) {
    const supplied = body.passphrase?.trim()
    if (!supplied) {
      return NextResponse.json({ error: "Passphrase required", needsPassphrase: true }, { status: 403 })
    }
    const [salt, hash] = link.passphrase.split(":")
    const attempt = crypto.scryptSync(supplied, salt, 64).toString("hex")
    if (attempt !== hash) {
      return NextResponse.json({ error: "Incorrect passphrase", needsPassphrase: true }, { status: 403 })
    }
  }

  // Increment view count
  await prisma.secureShareLink.update({
    where: { id },
    data: { viewCount: { increment: 1 } },
  })

  // Fetch the resource
  if (link.resourceType === "credential") {
    const cred = await prisma.credential.findUnique({
      where: { id: link.resourceId },
      select: { label: true, username: true, encryptedPassword: true, url: true, notes: true },
    })
    if (!cred) return NextResponse.json({ error: "Resource not found" }, { status: 404 })

    return NextResponse.json({
      type: "credential",
      data: {
        label: cred.label,
        username: cred.username,
        password: decrypt(cred.encryptedPassword),
        url: cred.url,
        notes: cred.notes,
      },
    })
  }

  if (link.resourceType === "document") {
    const doc = await prisma.clientDocument.findUnique({
      where: { id: link.resourceId },
      select: { title: true, content: true, category: true },
    })
    if (!doc) return NextResponse.json({ error: "Resource not found" }, { status: 404 })

    return NextResponse.json({
      type: "document",
      data: {
        title: doc.title,
        content: doc.content,
        category: doc.category,
      },
    })
  }

  return NextResponse.json({ error: "Invalid resource type" }, { status: 400 })
}

/** GET to check link validity without consuming a view */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const link = await prisma.secureShareLink.findUnique({
    where: { id },
    select: { id: true, resourceType: true, expiresAt: true, maxViews: true, viewCount: true, passphrase: true },
  })

  if (!link || link.expiresAt < new Date() || link.viewCount >= link.maxViews) {
    return NextResponse.json({ valid: false })
  }

  return NextResponse.json({
    valid: true,
    resourceType: link.resourceType,
    viewsRemaining: link.maxViews - link.viewCount,
    hasPassphrase: !!link.passphrase,
  })
}
