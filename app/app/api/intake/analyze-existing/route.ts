import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { isIntakeEnabled } from "@/lib/ai/anthropic"
import { extractForAI } from "@/lib/ai/extract"
import { classify } from "@/lib/ai/classify"
import { readFile } from "fs/promises"
import path from "path"

const UPLOAD_DIR = "/uploads"

/**
 * POST /api/intake/analyze-existing  { attachmentId }
 *
 * Runs the AI classifier against a file ALREADY stored in the library (a
 * ClientAttachment) and returns the proposal transiently — no IntakeSuggestion
 * row, no duplicated file. The UI reviews the result and then POSTs to
 * /api/attachments/[id]/build-asset to actually create + link the asset.
 */
export async function POST(req: Request) {
  const { error } = await requireAuth()
  if (error) return error

  if (!isIntakeEnabled()) {
    return NextResponse.json(
      { error: "AI analysis is disabled (set AI_INTAKE_ENABLED=true and ANTHROPIC_API_KEY)." },
      { status: 503 },
    )
  }

  try {
    const { attachmentId } = await req.json()
    if (!attachmentId) return NextResponse.json({ error: "attachmentId required" }, { status: 400 })

    const att = await prisma.clientAttachment.findUnique({ where: { id: attachmentId } })
    if (!att) return NextResponse.json({ error: "Attachment not found" }, { status: 404 })

    let buffer: Buffer
    try {
      buffer = await readFile(path.join(UPLOAD_DIR, att.storageName))
    } catch {
      return NextResponse.json({ error: "File missing on disk" }, { status: 404 })
    }

    const mimeType = att.detectedMime || att.mimeType
    const extracted = await extractForAI(buffer, mimeType, att.originalName)
    const { result, usage, modelId } = await classify({
      clientId: att.clientId,
      filename: att.originalName,
      mimeType,
      extracted,
    })

    return NextResponse.json({
      clientId: att.clientId,
      candidates: result.candidates ?? [],
      proposedNewAsset: result.proposedNewAsset ?? null,
      bulkProposal: result.bulkProposal ?? null,
      extractedData: result.extractedData ?? null,
      aiModel: modelId,
      tokens: { in: usage.inputTokens, out: usage.outputTokens },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[analyze-existing] failed:", err)
    return NextResponse.json({ error: msg || "Analysis failed" }, { status: 500 })
  }
}
