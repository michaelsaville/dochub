import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { writeFile, mkdir, unlink, readFile } from "fs/promises"
import { existsSync } from "fs"
import path from "path"
import crypto from "crypto"

const UPLOAD_DIR = "/uploads"
const SETTING_KEY = "platform:logoStorageName"
const MAX_SIZE = 5 * 1024 * 1024 // 5MB

async function getStorageName(): Promise<string | null> {
  const s = await prisma.appSetting.findUnique({ where: { key: SETTING_KEY } })
  return s?.value ?? null
}

export async function GET(_req: Request) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const storageName = await getStorageName()
    if (!storageName) return NextResponse.json({ error: "No logo set" }, { status: 404 })

    const filePath = path.join(UPLOAD_DIR, storageName)
    const buffer = await readFile(filePath)
    const ext = path.extname(storageName).toLowerCase()
    const mime = ext === ".png" ? "image/png" : ext === ".gif" ? "image/gif" : ext === ".webp" ? "image/webp" : ext === ".svg" ? "image/svg+xml" : "image/jpeg"

    return new Response(buffer, {
      headers: { "Content-Type": mime, "Cache-Control": "private, max-age=3600" },
    })
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
}

export async function POST(req: Request) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const formData = await req.formData()
    const file = formData.get("file") as File | null
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })
    if (file.size > MAX_SIZE) return NextResponse.json({ error: "File exceeds 5MB limit" }, { status: 400 })
    if (!file.type.startsWith("image/")) return NextResponse.json({ error: "File must be an image" }, { status: 400 })

    if (!existsSync(UPLOAD_DIR)) await mkdir(UPLOAD_DIR, { recursive: true })

    // Delete old logo if exists
    const old = await getStorageName()
    if (old) await unlink(path.join(UPLOAD_DIR, old)).catch(() => {})

    const ext = path.extname(file.name) || ".png"
    const storageName = `logo-${crypto.randomUUID()}${ext}`
    await writeFile(path.join(UPLOAD_DIR, storageName), Buffer.from(await file.arrayBuffer()))

    await prisma.appSetting.upsert({
      where: { key: SETTING_KEY },
      update: { value: storageName },
      create: { key: SETTING_KEY, value: storageName },
    })

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error("Logo upload error:", e)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}

export async function DELETE(_req: Request) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const storageName = await getStorageName()
    if (storageName) await unlink(path.join(UPLOAD_DIR, storageName)).catch(() => {})
    await prisma.appSetting.deleteMany({ where: { key: SETTING_KEY } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
