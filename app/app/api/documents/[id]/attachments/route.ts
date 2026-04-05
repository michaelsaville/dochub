import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { writeFile, mkdir } from "fs/promises"
import { existsSync } from "fs"
import path from "path"
import crypto from "crypto"

const UPLOAD_DIR = "/uploads"
const MAX_SIZE = 25 * 1024 * 1024 // 25MB

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params

    // Verify doc exists and get clientId
    const doc = await prisma.clientDocument.findUnique({ where: { id } })
    if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 })

    const formData = await req.formData()
    const file = formData.get("file") as File | null
    const notes = (formData.get("notes") as string) ?? ""

    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })
    if (file.size > MAX_SIZE) return NextResponse.json({ error: "File exceeds 25MB limit" }, { status: 400 })

    // Ensure upload dir exists
    if (!existsSync(UPLOAD_DIR)) await mkdir(UPLOAD_DIR, { recursive: true })

    // Generate unique storage name
    const ext = path.extname(file.name) || ""
    const storageName = `${crypto.randomUUID()}${ext}`
    const filePath = path.join(UPLOAD_DIR, storageName)

    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(filePath, buffer)

    const attachment = await prisma.clientAttachment.create({
      data: {
        clientId: doc.clientId,
        documentId: id,
        originalName: file.name,
        storageName,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        notes: notes.trim() || null,
      },
    })

    return NextResponse.json(attachment, { status: 201 })
  } catch (e: any) {
    console.error("Upload error:", e)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}
