import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"
import { unlink } from "fs/promises"
import { createReadStream, existsSync } from "fs"
import { PassThrough } from "stream"
import { Readable } from "stream"
import path from "path"
import { baseFileHeaders, contentDisposition } from "@/lib/files/preview-policy"

const UPLOAD_DIR = "/uploads"

/**
 * POST /api/attachments/bulk
 *   { action: "delete", ids: [...] }            -> batch delete
 *   { action: "zip", ids: [...], name?: "x" }   -> stream a .zip of the files
 */
export async function POST(req: Request) {
  const { error } = await requireAuth()
  if (error) return error
  try {
    const body = await req.json()
    const { action, ids, name } = body
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "ids required" }, { status: 400 })
    }

    const atts = await prisma.clientAttachment.findMany({ where: { id: { in: ids } } })
    if (atts.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 })

    if (action === "move") {
      // Move loose library files into another folder (null = root). Documents
      // are moved by the caller via PATCH /api/documents/[id].
      await prisma.clientAttachment.updateMany({
        where: { id: { in: atts.map((a) => a.id) } },
        data: { folderId: body.targetFolderId ?? null },
      })
      return NextResponse.json({ success: true, moved: atts.length })
    }

    if (action === "delete") {
      for (const a of atts) {
        await unlink(path.join(UPLOAD_DIR, a.storageName)).catch(() => {})
      }
      await prisma.clientAttachment.deleteMany({ where: { id: { in: atts.map((a) => a.id) } } })
      return NextResponse.json({ success: true, deleted: atts.length })
    }

    if (action === "zip") {
      const archiverMod: any = await import("archiver")
      const archiver = archiverMod.default ?? archiverMod
      const archive = archiver("zip", { zlib: { level: 6 } })
      const pass = new PassThrough()
      archive.on("error", (e: Error) => pass.destroy(e))
      archive.pipe(pass)

      // De-dupe names inside the archive.
      const used = new Set<string>()
      for (const a of atts) {
        const full = path.join(UPLOAD_DIR, a.storageName)
        if (!existsSync(full)) continue
        let entry = a.originalName || a.storageName
        if (used.has(entry)) {
          const ext = path.extname(entry)
          entry = `${entry.slice(0, entry.length - ext.length)}-${a.id.slice(0, 6)}${ext}`
        }
        used.add(entry)
        archive.append(createReadStream(full), { name: entry })
      }
      archive.finalize()

      const filename = `${(name || "files").replace(/[^a-z0-9_-]+/gi, "_")}.zip`
      return new Response(Readable.toWeb(pass) as ReadableStream, {
        headers: {
          ...baseFileHeaders(),
          "Content-Type": "application/zip",
          "Content-Disposition": contentDisposition("attachment", filename),
        },
      })
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  } catch (e) {
    console.error("[attachments] bulk failed", e)
    return NextResponse.json({ error: "Bulk operation failed" }, { status: 500 })
  }
}
