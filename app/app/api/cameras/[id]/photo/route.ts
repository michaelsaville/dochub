import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { writeFile, mkdir, unlink, readFile } from "fs/promises"
import { existsSync } from "fs"
import path from "path"
import crypto from "crypto"

const UPLOAD_DIR = "/uploads"
const MAX_SIZE = 10 * 1024 * 1024

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const { id } = await params
    const cam = await prisma.camera.findUnique({ where: { id }, select: { photoStorageName: true } })
    if (!cam?.photoStorageName) return NextResponse.json({ error: "No photo" }, { status: 404 })
    const buffer = await readFile(path.join(UPLOAD_DIR, cam.photoStorageName))
    const ext = path.extname(cam.photoStorageName).toLowerCase()
    const mime = ext === ".png" ? "image/png" : ext === ".gif" ? "image/gif" : ext === ".webp" ? "image/webp" : "image/jpeg"
    return new Response(buffer, { headers: { "Content-Type": mime, "Cache-Control": "private, max-age=3600" } })
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
    const cam = await prisma.camera.findUnique({ where: { id }, select: { id: true, photoStorageName: true } })
    if (!cam) return NextResponse.json({ error: "Camera not found" }, { status: 404 })
    const formData = await req.formData()
    const file = formData.get("file") as File | null
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 })
    if (file.size > MAX_SIZE) return NextResponse.json({ error: "File exceeds 10MB" }, { status: 400 })
    if (!file.type.startsWith("image/")) return NextResponse.json({ error: "Must be an image" }, { status: 400 })
    if (!existsSync(UPLOAD_DIR)) await mkdir(UPLOAD_DIR, { recursive: true })
    if (cam.photoStorageName) await unlink(path.join(UPLOAD_DIR, cam.photoStorageName)).catch(() => {})
    const ext = path.extname(file.name) || ".jpg"
    const storageName = `cam-photo-${crypto.randomUUID()}${ext}`
    await writeFile(path.join(UPLOAD_DIR, storageName), Buffer.from(await file.arrayBuffer()))
    await prisma.camera.update({ where: { id }, data: { photoStorageName: storageName } })
    return NextResponse.json({ photoStorageName: storageName })
  } catch (e) {
    console.error("Camera photo upload error:", e)
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
    const cam = await prisma.camera.findUnique({ where: { id }, select: { photoStorageName: true } })
    if (cam?.photoStorageName) await unlink(path.join(UPLOAD_DIR, cam.photoStorageName)).catch(() => {})
    await prisma.camera.update({ where: { id }, data: { photoStorageName: null } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
