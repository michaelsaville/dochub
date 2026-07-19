/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server"
import { rename, mkdir, writeFile } from "fs/promises"
import { existsSync } from "fs"
import path from "path"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth"

const UPLOAD_DIR = "/uploads"
const UPLOAD_TRASH = path.join(UPLOAD_DIR, "notes-trash")

// POST /api/notes-intake/[id]/delete-source  body: { action: "trash" | "restore" }
// Uploaded files are trashed/restored in-app immediately (the /uploads volume is
// writable by the app). Ingested files (Obsidian vault / Apple Notes export) live
// on the host outside the container, so we only record intent — a host reaper
// (scripts/notes-source-reaper.mjs) performs the git rm / move-to-trash.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAuth()
  if (error) return error
  const { id } = await params

  const s = await prisma.noteSuggestion.findUnique({ where: { id } })
  if (!s) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const body = (await req.json().catch(() => ({}))) as any
  const action: "trash" | "restore" = body.action === "restore" ? "restore" : "trash"

  // ── Uploaded files: act immediately within /uploads ──
  if (s.origin === "upload") {
    const storage = s.uploadStorageName
    if (!storage) return NextResponse.json({ error: "No stored file" }, { status: 400 })
    const live = path.join(UPLOAD_DIR, storage)
    const trash = path.join(UPLOAD_TRASH, id, storage)
    try {
      if (action === "trash") {
        if (existsSync(live)) {
          await mkdir(path.dirname(trash), { recursive: true })
          await rename(live, trash)
          await writeFile(path.join(UPLOAD_TRASH, id, "manifest.json"), JSON.stringify({
            suggestionId: id, originalName: s.uploadOriginalName, storageName: storage,
            trashedBy: session?.user?.email ?? null, trashedAt: new Date().toISOString(),
          }, null, 2))
        }
        const updated = await prisma.noteSuggestion.update({
          where: { id }, data: { sourceState: existsSync(trash) ? "TRASHED" : "GONE", sourceTrashPath: trash, sourceDeletedAt: new Date(), sourceDeleteError: null },
        })
        return NextResponse.json({ suggestion: updated, mode: "immediate" })
      } else {
        if (existsSync(trash)) await rename(trash, live)
        const updated = await prisma.noteSuggestion.update({
          where: { id }, data: { sourceState: "PRESENT", sourceTrashPath: null, sourceDeletedAt: null },
        })
        return NextResponse.json({ suggestion: updated, mode: "immediate" })
      }
    } catch (err: any) {
      return NextResponse.json({ error: `File op failed: ${err?.message || err}` }, { status: 500 })
    }
  }

  // ── Structured imports (csv / otpauth) have no on-disk source file ──
  if (!s.sourceAbsPath) {
    const updated = await prisma.noteSuggestion.update({ where: { id }, data: { sourceState: action === "trash" ? "GONE" : "PRESENT", sourcePendingOp: null } })
    return NextResponse.json({ suggestion: updated, mode: "no-source" })
  }

  // ── Ingested files: queue for the host reaper ──
  if (action === "trash") {
    // Already trashed and asking to trash again → no-op.
    if (s.sourceState === "TRASHED") return NextResponse.json({ suggestion: s, mode: "already-trashed" })
    const updated = await prisma.noteSuggestion.update({
      where: { id }, data: { sourcePendingOp: "TRASH", sourceDeleteError: null },
    })
    return NextResponse.json({ suggestion: updated, mode: "queued" })
  } else {
    // Restore: if a trash op is still pending, just cancel it; if already trashed, queue a restore.
    const data = s.sourceState === "TRASHED" ? { sourcePendingOp: "RESTORE" } : { sourcePendingOp: null }
    const updated = await prisma.noteSuggestion.update({ where: { id }, data })
    return NextResponse.json({ suggestion: updated, mode: s.sourceState === "TRASHED" ? "queued" : "cancelled" })
  }
}
