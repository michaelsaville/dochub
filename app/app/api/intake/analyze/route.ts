import { NextResponse } from "next/server"
import { writeFile, mkdir } from "fs/promises"
import { existsSync } from "fs"
import path from "path"
import crypto from "crypto"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { isIntakeEnabled } from "@/lib/ai/anthropic"
import { extractForAI } from "@/lib/ai/extract"
import { classify } from "@/lib/ai/classify"

const UPLOAD_DIR = "/uploads"
const MAX_SIZE = 25 * 1024 * 1024 // 25MB

export async function POST(req: Request) {
  if (!isIntakeEnabled()) {
    return NextResponse.json({ error: "AI intake is disabled" }, { status: 503 })
  }

  const { session, error } = await requireAuth()
  if (error) return error

  try {
    const formData = await req.formData()
    const clientId = formData.get("clientId") as string | null
    const file = formData.get("file") as File | null
    const context = ((formData.get("context") as string) ?? "").trim()

    if (!clientId) return NextResponse.json({ error: "clientId required" }, { status: 400 })
    if (!file && !context) {
      return NextResponse.json({ error: "Either a file or context text is required" }, { status: 400 })
    }
    if (file && file.size > MAX_SIZE) {
      return NextResponse.json({ error: "File exceeds 25MB limit" }, { status: 400 })
    }

    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } })
    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 })

    if (!existsSync(UPLOAD_DIR)) await mkdir(UPLOAD_DIR, { recursive: true })

    // Determine what we're persisting: either the uploaded file, or — for
    // text-only intake — synthesize a .txt file from the context message.
    let buffer: Buffer
    let originalName: string
    let mimeType: string
    let sizeBytes: number

    if (file) {
      buffer = Buffer.from(await file.arrayBuffer())
      originalName = file.name
      mimeType = file.type || "application/octet-stream"
      sizeBytes = file.size
    } else {
      buffer = Buffer.from(context, "utf-8")
      const stamp = new Date().toISOString().slice(0, 16).replace(/[-T:]/g, "")
      originalName = `tech-note-${stamp}.txt`
      mimeType = "text/plain"
      sizeBytes = buffer.byteLength
    }

    const ext = path.extname(originalName) || ""
    const storageName = `${crypto.randomUUID()}${ext}`
    const filePath = path.join(UPLOAD_DIR, storageName)
    await writeFile(filePath, buffer)

    const uploadedBy = session?.user?.email ?? null

    let suggestion = await prisma.intakeSuggestion.create({
      data: {
        clientId,
        uploadedBy,
        status: "PENDING",
        originalName,
        storageName,
        mimeType,
        size: sizeBytes,
      },
    })

    try {
      // For text-only submissions, feed the text straight to the classifier.
      const extracted = file
        ? await extractForAI(buffer, mimeType, originalName)
        : ({ kind: "text" as const, text: context, summary: `Technician note, ${context.length} chars` })

      const { result, usage, modelId } = await classify({
        clientId,
        filename: originalName,
        mimeType,
        extracted,
        userContext: file ? context : undefined, // for text-only, the text IS the content — don't duplicate
      })

      suggestion = await prisma.intakeSuggestion.update({
        where: { id: suggestion.id },
        data: {
          candidatesJson: result.candidates,
          proposedNewAssetJson: result.proposedNewAsset ?? undefined,
          cameraActionJson: result.cameraAction ?? undefined,
          bulkProposalJson: result.bulkProposal ?? undefined,
          extractedDataJson: result.extractedData,
          aiModel: modelId,
          aiTokensIn: usage.inputTokens,
          aiTokensOut: usage.outputTokens,
        },
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error("AI intake classify failed:", err)
      suggestion = await prisma.intakeSuggestion.update({
        where: { id: suggestion.id },
        data: { status: "FAILED", aiError: msg },
      })
    }

    return NextResponse.json(suggestion, { status: 201 })
  } catch (e) {
    console.error("AI intake analyze error:", e)
    return NextResponse.json({ error: "Intake failed" }, { status: 500 })
  }
}
