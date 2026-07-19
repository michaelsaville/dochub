// notes-source-reaper.mjs — host-side worker for Notes Intake source deletion.
//
// The DocHub container can't reach ~/Notes (Obsidian vault, a git repo synced to
// the iPad) or ~/notes-intake-work/export (Apple Notes export copy). The app only
// records intent (NoteSuggestion.sourcePendingOp = TRASH | RESTORE); this script,
// run by host cron, performs the actual, recoverable move:
//   - Obsidian vault (git): copy file to trash, then `git rm` + commit (revertable).
//   - Apple Notes export (non-git): move file to trash + manifest.
//   - RESTORE: move the trashed copy back (+ git add/commit for the vault).
// Nothing is ever hard-deleted. Trash lives at ~/notes-intake-trash/<id>/.
//
// Run:  DATABASE_URL="postgresql://USER:PASS@172.18.0.9:5432/DB" node scripts/notes-source-reaper.mjs

import fs from "node:fs"
import fsp from "node:fs/promises"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { PrismaClient } from "@prisma/client"

const HOME = process.env.HOME || "/home/msaville"
const TRASH_ROOT = process.env.NOTES_INTAKE_TRASH || path.join(HOME, "notes-intake-trash")
const GIT_NAME = "Notes Intake Reaper"
const GIT_EMAIL = process.env.NOTES_INTAKE_GIT_EMAIL || "msaville.pcc2k@gmail.com"

const prisma = new PrismaClient()

function git(cwd, args) {
  return execFileSync("git", ["-c", `user.name=${GIT_NAME}`, "-c", `user.email=${GIT_EMAIL}`, ...args], { cwd, encoding: "utf8" }).trim()
}
function gitRepoRoot(dir) {
  try { return execFileSync("git", ["-C", dir, "rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim() } catch { return null }
}

async function doTrash(row) {
  const abs = row.sourceAbsPath
  if (!abs) throw new Error("no sourceAbsPath — cannot resolve file (re-ingest or backfill)")
  const trashDir = path.join(TRASH_ROOT, row.id)
  const trashFile = path.join(trashDir, path.basename(abs))

  if (!fs.existsSync(abs)) {
    // Already gone on disk (e.g. edited/removed from the iPad). Not an error.
    return { sourceState: "GONE", sourcePendingOp: null, sourceDeletedAt: new Date(), sourceTrashPath: null }
  }
  await fsp.mkdir(trashDir, { recursive: true })
  await fsp.copyFile(abs, trashFile)
  await fsp.writeFile(path.join(trashDir, "manifest.json"), JSON.stringify({
    suggestionId: row.id, noteTitle: row.noteTitle, sourceType: row.sourceType,
    originalPath: abs, sourceFolder: row.sourceFolder, trashedAt: new Date().toISOString(),
  }, null, 2))

  const root = row.sourceType === "obsidian" ? gitRepoRoot(path.dirname(abs)) : null
  if (root) {
    const rel = path.relative(root, abs)
    git(root, ["rm", "--", rel])
    git(root, ["commit", "-m", `notes-intake: trash "${row.noteTitle}" (${row.id})`])
  } else {
    await fsp.rm(abs, { force: true })
  }
  return { sourceState: "TRASHED", sourcePendingOp: null, sourceDeletedAt: new Date(), sourceTrashPath: trashFile, sourceDeleteError: null }
}

async function doRestore(row) {
  const abs = row.sourceAbsPath
  const trashFile = row.sourceTrashPath
  if (!abs || !trashFile || !fs.existsSync(trashFile)) {
    return { sourceState: row.sourceState === "TRASHED" ? "GONE" : "PRESENT", sourcePendingOp: null }
  }
  await fsp.mkdir(path.dirname(abs), { recursive: true })
  await fsp.copyFile(trashFile, abs)
  const root = row.sourceType === "obsidian" ? gitRepoRoot(path.dirname(abs)) : null
  if (root) {
    const rel = path.relative(root, abs)
    git(root, ["add", "--", rel])
    git(root, ["commit", "-m", `notes-intake: restore "${row.noteTitle}" (${row.id})`])
  }
  await fsp.rm(path.dirname(trashFile), { recursive: true, force: true })
  return { sourceState: "PRESENT", sourcePendingOp: null, sourceTrashPath: null, sourceDeletedAt: null, sourceDeleteError: null }
}

async function main() {
  const rows = await prisma.noteSuggestion.findMany({
    where: { origin: "ingest", sourcePendingOp: { in: ["TRASH", "RESTORE"] } },
  })
  if (rows.length === 0) { await prisma.$disconnect(); return }
  console.log(`[reaper] ${rows.length} pending op(s)`)
  for (const row of rows) {
    try {
      const data = row.sourcePendingOp === "TRASH" ? await doTrash(row) : await doRestore(row)
      await prisma.noteSuggestion.update({ where: { id: row.id }, data })
      console.log(`[reaper] ${row.sourcePendingOp} ok: ${row.noteTitle}`)
    } catch (err) {
      const msg = String(err?.message || err)
      await prisma.noteSuggestion.update({ where: { id: row.id }, data: { sourcePendingOp: null, sourceDeleteError: msg } })
      console.error(`[reaper] ${row.sourcePendingOp} FAILED: ${row.noteTitle} — ${msg}`)
    }
  }
  await prisma.$disconnect()
}

main().catch((e) => { console.error("[reaper] fatal", e); process.exit(1) })
