/**
 * Single pipeline every uploaded file flows through, regardless of which
 * route accepted it: size check -> magic-byte MIME -> antivirus scan ->
 * write to disk -> dimensions/previewability -> row create -> async text
 * extraction. Keeping it in one place means the security guarantees can't
 * drift between /api/attachments and /api/documents/[id]/attachments.
 */
import { prisma } from "@/lib/prisma"
import { writeFile, mkdir } from "fs/promises"
import { existsSync } from "fs"
import path from "path"
import crypto from "crypto"
import { scanBuffer } from "./clamav"
import { detectMime, imageDimensions, ingestSearchableText } from "./ingest"
import { isPreviewable } from "./preview-policy"

export const UPLOAD_DIR = "/uploads"
export const MAX_SIZE = 100 * 1024 * 1024 // 100MB

export type StoreError = { error: string; status: number }
export type StoreOk = { attachment: any }

export function isStoreError(r: StoreOk | StoreError): r is StoreError {
  return (r as StoreError).error !== undefined
}

/**
 * Validate + scan + persist a file. `link` carries the polymorphic FK(s) and
 * the required clientId security boundary; the caller resolves those.
 */
export async function storeUploadedFile(
  file: File,
  link: {
    clientId: string
    documentId?: string | null
    assetId?: string | null
    vendorId?: string | null
    locationId?: string | null
    vendorContractId?: string | null
  },
  notes?: string | null,
): Promise<StoreOk | StoreError> {
  if (file.size > MAX_SIZE) {
    return { error: `File exceeds ${Math.round(MAX_SIZE / 1024 / 1024)}MB limit`, status: 400 }
  }
  const buffer = Buffer.from(await file.arrayBuffer())

  // Antivirus first — never write a known-infected file to disk.
  const scan = await scanBuffer(buffer)
  if (scan.status === "infected") {
    return { error: `File rejected by antivirus: ${scan.signature}`, status: 422 }
  }

  const detectedMime = await detectMime(buffer, file.name)
  const { width, height } = await imageDimensions(buffer, detectedMime)

  if (!existsSync(UPLOAD_DIR)) await mkdir(UPLOAD_DIR, { recursive: true })
  const ext = path.extname(file.name) || ""
  const storageName = `${crypto.randomUUID()}${ext}`
  await writeFile(path.join(UPLOAD_DIR, storageName), buffer)

  const attachment = await prisma.clientAttachment.create({
    data: {
      clientId: link.clientId,
      documentId: link.documentId ?? null,
      assetId: link.assetId ?? null,
      vendorId: link.vendorId ?? null,
      locationId: link.locationId ?? null,
      vendorContractId: link.vendorContractId ?? null,
      originalName: file.name,
      storageName,
      mimeType: file.type || "application/octet-stream",
      detectedMime,
      previewable: isPreviewable(detectedMime),
      width,
      height,
      size: file.size,
      notes: notes?.trim() || null,
      scanStatus: scan.status,
      // infected never reaches here (we returned above); surface skip/error reason.
      scanDetail: "reason" in scan ? scan.reason : null,
    },
  })

  // Non-blocking: extract searchable text / OCR after responding.
  ingestSearchableText(attachment.id, buffer, detectedMime, file.name)

  return { attachment }
}
