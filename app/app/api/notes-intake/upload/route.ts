/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server"
import { writeFile, mkdir } from "fs/promises"
import { existsSync } from "fs"
import path from "path"
import crypto from "crypto"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { isIntakeEnabled } from "@/lib/ai/anthropic"
import { extractForAI } from "@/lib/ai/extract"
import { scanBuffer } from "@/lib/files/clamav"
import { detectMime } from "@/lib/files/ingest"
import { classifyNote } from "@/lib/ai/notes-classify"
import { renderPdfToImages } from "@/lib/files/pdf-render"
import { sealEntities, sealValue } from "@/lib/notes-intake-secrets"

const UPLOAD_DIR = "/uploads"
const MAX_SIZE = 25 * 1024 * 1024 // 25MB
const CLAUDE_IMAGE_MIMES = ["image/png", "image/jpeg", "image/gif", "image/webp"]

function sourceTypeFromMime(mime: string): string {
  if (mime === "application/pdf") return "pdf-scan"
  if (mime.startsWith("image/")) return "screenshot" // refined by AI sourceKind below
  return "other"
}

// POST /api/notes-intake/upload — multipart, one or more files. Each file is
// AV-scanned, HEIC-normalized, stored, extracted, and classified into a
// NoteSuggestion row (origin=upload) that flows through the same review queue.
export async function POST(req: Request) {
  if (!isIntakeEnabled()) return NextResponse.json({ error: "AI intake is disabled" }, { status: 503 })
  const { session, error } = await requireAuth()
  if (error) return error

  let formData: FormData
  try { formData = await req.formData() } catch { return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 }) }

  const files = formData.getAll("files").filter((f): f is File => f instanceof File)
  const single = formData.get("file")
  if (single instanceof File) files.push(single)
  if (files.length === 0) return NextResponse.json({ error: "No files provided" }, { status: 400 })

  const clients = await prisma.client.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } })

  if (!existsSync(UPLOAD_DIR)) await mkdir(UPLOAD_DIR, { recursive: true })

  const created: any[] = []
  const errors: { name: string; error: string }[] = []

  for (const file of files) {
    try {
      if (file.size > MAX_SIZE) { errors.push({ name: file.name, error: "exceeds 25MB" }); continue }
      const buffer = Buffer.from(await file.arrayBuffer())

      const scan = await scanBuffer(buffer)
      if (scan.status === "infected") { errors.push({ name: file.name, error: `antivirus: ${scan.signature}` }); continue }

      const detectedMime = await detectMime(buffer, file.name)
      const title = file.name.replace(/\.[^.]+$/, "")
      const hash = crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 16)

      // Dedupe only against notes still awaiting review (re-upload after reject/commit is allowed).
      const dup = await prisma.noteSuggestion.findFirst({ where: { noteHash: hash, status: "PENDING" }, select: { id: true } })
      if (dup) { errors.push({ name: file.name, error: "already in queue" }); continue }

      // Persist the original bytes.
      const ext = path.extname(file.name) || ""
      const storageName = `${crypto.randomUUID()}${ext}`
      await writeFile(path.join(UPLOAD_DIR, storageName), buffer)

      // Extract content for the AI:
      //  - born-digital PDF → text (pdftotext)
      //  - image-based PDF (scan / Freeform board) → render pages to images for vision
      //  - image (HEIC/oversized normalized) → single image for vision
      //  - text/CSV → text
      let extracted: any
      if (detectedMime === "application/pdf") {
        const textEx = await extractForAI(buffer, detectedMime, file.name)
        const textLen = textEx.kind === "text" ? textEx.text.replace(/\s/g, "").length : 0
        if (textLen >= 150) {
          extracted = textEx
        } else {
          try {
            const images = await renderPdfToImages(buffer, 5)
            extracted = images.length ? { kind: "images", images, summary: `PDF rendered to ${images.length} page image(s) for vision` } : textEx
          } catch { extracted = textEx }
        }
      } else if (detectedMime.startsWith("image/") && (!CLAUDE_IMAGE_MIMES.includes(detectedMime) || buffer.length > 4_500_000)) {
        let jpg: Buffer = buffer, converted = false
        try { const sharp = (await import("sharp")).default; jpg = await sharp(buffer).resize(1568, 1568, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer(); converted = true } catch { /* keep original */ }
        if (!converted && !CLAUDE_IMAGE_MIMES.includes(detectedMime)) {
          // e.g. HEIC without libheif — don't send a mislabeled image to vision.
          extracted = { kind: "unsupported", summary: `${detectedMime} could not be decoded — re-upload as JPEG/PNG` }
        } else {
          extracted = await extractForAI(converted ? jpg : buffer, converted ? "image/jpeg" : detectedMime, file.name)
        }
      } else {
        extracted = await extractForAI(buffer, detectedMime, file.name)
      }

      // Create the row up front so a classify failure still leaves a reviewable/retryable row.
      const row = await prisma.noteSuggestion.create({
        data: {
          origin: "upload",
          sourcePath: storageName,
          sourceFolder: "Uploads",
          noteTitle: title,
          noteHash: hash,
          rawText: extracted.kind === "text" ? sealValue(extracted.text.slice(0, 12000)) : `[${extracted.summary}]`,
          status: "PENDING",
          sourceType: sourceTypeFromMime(detectedMime),
          uploadStorageName: storageName,
          uploadOriginalName: file.name,
          uploadMimeType: file.type || null,
          uploadDetectedMime: detectedMime,
          uploadSize: file.size,
        },
      })

      try {
        const { parsed, usage, model } = await classifyNote({ title, extracted, clients })
        const entities = (parsed.entities || []).map((e: any) => ({ ...e, include: true }))
        const refinedType =
          detectedMime.startsWith("image/") && parsed.sourceKind ? parsed.sourceKind : sourceTypeFromMime(detectedMime)
        const updated = await prisma.noteSuggestion.update({
          where: { id: row.id },
          data: {
            status: parsed.isRelevant ? "PENDING" : "SKIPPED",
            isRelevant: !!parsed.isRelevant,
            relevanceReason: parsed.relevanceReason || null,
            matchedClientId: parsed.clientId || null,
            matchedClientName: parsed.clientName || null,
            clientConfidence: typeof parsed.clientConfidence === "number" ? parsed.clientConfidence : null,
            clientReasoning: parsed.clientReasoning || null,
            clientCandidatesJson: parsed.clientAlternatives || [],
            entitiesJson: sealEntities(entities),
            sourceType: refinedType,
            aiModel: model,
            aiTokensIn: usage.inTokens,
            aiTokensOut: usage.outTokens,
          },
        })
        created.push(updated)
      } catch (err: any) {
        await prisma.noteSuggestion.update({ where: { id: row.id }, data: { status: "FAILED", aiError: String(err?.message || err) } })
        errors.push({ name: file.name, error: `analysis failed: ${err?.message || err}` })
      }
    } catch (err: any) {
      errors.push({ name: file.name, error: String(err?.message || err) })
    }
  }

  return NextResponse.json({ created: created.length, errors, uploadedBy: session?.user?.email ?? null })
}
