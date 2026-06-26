import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { readSignedBody, resolveGrant, sharedIds } from "../_helpers"

export const dynamic = "force-dynamic"

interface Payload {
  vendorId: string
  clientId: string
}

/**
 * POST /api/bff/portal/dochub/vendor/shared  (HMAC-signed, from the portal)
 * Body: { vendorId, clientId }
 *
 * Returns the masked set of credentials, documents and files shared with this
 * vendor for this client. Default-deny: every item is gated by a VendorShare
 * row. Secrets are never returned here — passwords/TOTP come from /reveal,
 * file bytes from /file.
 */
export async function POST(req: Request) {
  const r = await readSignedBody<Payload>(req)
  if (!r.ok) return r.res
  const { vendorId, clientId } = r.body
  if (!vendorId || !clientId) {
    return NextResponse.json({ ok: false, error: "vendorId, clientId required" }, { status: 400 })
  }

  const grant = await resolveGrant(vendorId, clientId)
  if (!grant) return NextResponse.json({ ok: false, error: "No active grant" }, { status: 403 })

  const [credIds, docIds, fileIds, vaultCredIds] = await Promise.all([
    sharedIds(grant.id, "CREDENTIAL"),
    sharedIds(grant.id, "DOCUMENT"),
    sharedIds(grant.id, "ATTACHMENT"),
    sharedIds(grant.id, "PORTAL_CREDENTIAL"),
  ])

  const [creds, docs, files, vaultCreds] = await Promise.all([
    credIds.length
      ? prisma.credential.findMany({
          // clientId scope is belt-and-suspenders: a share should never point
          // at another client's credential, but never trust the id blindly.
          where: { id: { in: credIds }, clientId, isRetired: false },
          select: {
            id: true, label: true, username: true, url: true,
            encryptedTotp: true, encryptedPassword: true,
          },
        })
      : [],
    docIds.length
      ? prisma.clientDocument.findMany({
          where: { id: { in: docIds }, clientId },
          select: { id: true, title: true, category: true, content: true, updatedAt: true },
        })
      : [],
    fileIds.length
      ? prisma.clientAttachment.findMany({
          where: { id: { in: fileIds }, clientId, supersededBy: null },
          select: {
            id: true, originalName: true, mimeType: true, detectedMime: true,
            size: true, previewable: true, createdAt: true,
          },
        })
      : [],
    // Phase 2: vault credentials a CLIENT user shared with this vendor.
    vaultCredIds.length
      ? prisma.portalCredential.findMany({
          where: { id: { in: vaultCredIds }, clientId },
          select: {
            id: true, label: true, username: true, url: true, encryptedTotp: true,
          },
        })
      : [],
  ])

  return NextResponse.json({
    ok: true,
    grant: { label: grant.label },
    credentials: [
      ...creds.map((c) => ({
        id: c.id,
        kind: "managed" as const,
        label: c.label,
        username: c.username,
        url: c.url,
        hasPassword: !!c.encryptedPassword,
        hasTotp: !!c.encryptedTotp,
      })),
      ...vaultCreds.map((c) => ({
        id: c.id,
        kind: "vault" as const,
        label: c.label,
        username: c.username,
        url: c.url,
        // PortalCredential.encryptedPassword is non-null in the schema.
        hasPassword: true,
        hasTotp: !!c.encryptedTotp,
      })),
    ],
    documents: docs.map((d) => ({
      id: d.id,
      title: d.title,
      category: d.category,
      content: d.content,
      updatedAt: d.updatedAt,
    })),
    files: files.map((f) => ({
      id: f.id,
      originalName: f.originalName,
      mimeType: f.mimeType,
      detectedMime: f.detectedMime,
      size: f.size,
      previewable: f.previewable,
      createdAt: f.createdAt,
    })),
  })
}
