import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { writeFile, mkdir, unlink, readFile } from "fs/promises"
import { existsSync } from "fs"
import path from "path"
import crypto from "crypto"

const UPLOAD_DIR = "/uploads"
const MAX_SIZE = 10 * 1024 * 1024 // 10MB

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const rack = await prisma.rack.findUnique({ where: { id }, select: { photoStorageName: true } })
    if (!rack?.photoStorageName) return NextResponse.json({ error: "No photo" }, { status: 404 })

    const filePath = path.join(UPLOAD_DIR, rack.photoStorageName)
    const buffer = await readFile(filePath)
    const ext = path.extname(rack.photoStorageName).toLowerCase()
    const mime = ext === ".png" ? "image/png" : ext === ".gif" ? "image/gif" : ext === ".webp" ? "image/webp" : "image/jpeg"

    return new Response(buffer, {
      headers: { "Content-Type": mime, "Cache-Control": "private, max-age=3600" },
    })
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const rack = await prisma.rack.findUnique({ where: { id }, select: { id: true, photoStorageName: true } })
    if (!rack) return NextResponse.json({ error: "Rack not found" }, { status: 404 })

    const formData = await req.formData()
    const file = formData.get("file") as File | null
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })
    if (file.size > MAX_SIZE) return NextResponse.json({ error: "File exceeds 10MB limit" }, { status: 400 })
    if (!file.type.startsWith("image/")) return NextResponse.json({ error: "File must be an image" }, { status: 400 })

    if (!existsSync(UPLOAD_DIR)) await mkdir(UPLOAD_DIR, { recursive: true })

    // Delete old photo if exists
    if (rack.photoStorageName) {
      await unlink(path.join(UPLOAD_DIR, rack.photoStorageName)).catch(() => {})
    }

    const ext = path.extname(file.name) || ".jpg"
    const storageName = `rack-photo-${crypto.randomUUID()}${ext}`
    await writeFile(path.join(UPLOAD_DIR, storageName), Buffer.from(await file.arrayBuffer()))

    const updated = await prisma.rack.update({
      where: { id },
      data: { photoStorageName: storageName },
    })

    return NextResponse.json({ photoStorageName: updated.photoStorageName })
  } catch (e) {
    console.error("Rack photo upload error:", e)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const rack = await prisma.rack.findUnique({ where: { id }, select: { photoStorageName: true } })
    if (rack?.photoStorageName) {
      await unlink(path.join(UPLOAD_DIR, rack.photoStorageName)).catch(() => {})
    }
    await prisma.rack.update({ where: { id }, data: { photoStorageName: null } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
